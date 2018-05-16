/*
Timzones:
  https://upload.wikimedia.org/wikipedia/commons/e/e8/Standard_World_Time_Zones.png

World Population
  http://sedac.ciesin.columbia.edu/data/collection/gpw-v4

Region names
  http://www.statoids.com/statoids.html

AWS for Python
  http://boto3.readthedocs.io/en/latest/

*/
(async function(){

'use strict';


const fs = require('fs');
const readline = require('readline');
const sqlite = require('sqlite3');
const zlib = require('zlib');
const path = require('path');
const moment = require('moment');

const CONFIG = {
	"path": "game",
	"customers": 10,
	"planetregions": {"lat": 10, "lng": 10},
	// amount of time in minutes that should pass in the
	// model, for every ms of real time.
	"timeIncrement": 1
};


const REGIONS = {
	'Europe': {
		"datacenter": "Dublin, Ireland",
		"customers": 0,
	},
	'Asia': {
		"datacenter": "Hong Kong, China",
		"customers": 0
	},
};



/** 
 * Represents a gridded population group within our map. This allows
 * us to estimate how many people within a region are becomming
 * active, and what the closest datacenter shoudl be.
 */
class PopRegion{
	constructor(boundaries){
		let self = this;
		self.bound = boundaries;
		let lat = (self.bound['n'] + self.bound['s']) / 2;
		let lng = (self.bound['e'] + self.bound['w']) / 2;
		self.center = {"lat": lat, "lng": lng};
		self.population = 0;
		self.area = 0;
		self.pop_ratio = 0.0;
		self.customers = 0;
	}

	contains(lat, lng){
		if (this.bound.n <= lat){
			return false;
		}
		else if (this.bound.s > lat){
			return false;
		}
		else if (this.bound.e <= lng){
			return false;
		}
		else if (this.bound.w > lng){
			return false;
		}
		return true;
	}

	add_data(data){
		let lng = data[2];
		let lat = data[3];
		let pop = parseFloat(data[6]);
		if(this.contains(lat, lng)){
			this.population = this.population + pop;
		}
	}

	calc_active(sym_time){
		let local_time = moment(sym_time).add(this.center.lng,'hours');
		let active = Helpers.random.triangular(0,this.customers-Math.abs(12-local_time.hours()),this.customers);
		return active;
	}
	
}


/**
 * The entire customer base of planet earth.
 */
class PopComplete{
	
	constructor(customers, region_count){
		process.stderr.write("Creating the planet ... \r");
		this.gameStart = Date.now();
		this.population = 0;
		this.Customers = customers;
	
		this.regions = [];
		this.region_idx = [];
		this.size_lat = 180 / region_count["lat"];
		this.size_lng = 360 / region_count["lng"];
		for (let lat=0; lat < region_count["lat"]; lat++){
			this.region_idx.push([]);
			for(let lng=0; lng < region_count.lng; lng++){
				let bound = {
					"s": (lat * this.size_lat) - 90,
					"w": (lng * this.size_lng) - 180,
				};
				bound.e = bound.w + this.size_lng;
				bound.n = bound.s + this.size_lat;
	
				let region = new PopRegion(bound);
				this.region_idx[lat].push(region);
				this.regions.push(region);
				
				process.stdout.write(`Creating the planet [${lat},${lng}] \r`);
			}
		}
		process.stderr.write(`Created the planet. \n`);
	}
	
	initialize(){
		let header = null;
		let recs = 0;
		
		// Calculate the number of customers we have in a given region
		// This number should be based off of data from NASA regarding
		// population density
		let self = this;

		let reader = new Promise((resolve,reject)=>{
			readline
				.createInterface({
					input: fs.createReadStream('gpwv4-2015.csv.gz').pipe(zlib.createGunzip())
				})
				.on('line', async (line) => {
					try{
						line = line.split(',');
					}
					catch(e){
						console.error('FAILED:'+line);
						return;
					}
					if (!header){
						header = line;
					}
					else{
						line[2] = parseFloat(line[2]);
						line[3] = parseFloat(line[3]);
						let lng = parseInt((line[2] + 180)/self.size_lng,10);
						let lat = parseInt((line[3] +  90)/self.size_lat,10);
						let year = parseInt(line[5],10);
						let pop = parseInt(line[6],10);
						let area = parseFloat(line[7]);
						
						if(year !== 2015){
							return;
						}
						
						let region = self.region_idx[lat][lng];
						region.add_data(line);
						self.population = self.population + region.population;
					}
					if (recs === 0){
						let pop = parseInt(Math.floor(this.population / 1000000),10);
						process.stderr.write("Populating Planet... {{population}} million               \r".replace('{{population}}',pop));
					}
					recs = (recs + 1) % 99;
				})
				.on('close', async ()=>{
					let customer = 0.0;
					self.population = parseInt(Math.round(self.population),10);
					let pop = parseInt(Math.floor(self.population / 1000000),10);
					self.regions.forEach(function(region){
						region.population = parseInt(Math.round(region.population),10);
						region.pop_ratio = region.population / self.population;
						region.customers = Math.floor(region.pop_ratio * self.customers);
						customer = customer + region.customers;
						process.stderr.write("Populating Planet... {2:,d} of {0:,d} ({1:.1f}%)\r".format(pop,(customer/self.population*100),Math.floor(customer)));
					});
					process.stderr.write("Populating Planet:                     \n");
					resolve(self);
				});
			
		});
		return reader;
	}

	calc_active(sym_time){
		let active = 0;
		for(let r in this.regions){
			let region = this.regions[r];
			region.calc_active(sym_time);
		}
		return active;
	}
	
	get gameTime(){
		// Get the current real time
		let time = Date.now();
		// determine how much real time has passed since the game started
		time = time - this.gameStart;
		// We are interested in the real time as a function of seconds
		time = time*1000;
		// Apply the time factor as specified in the configuration
		time = time*CONFIG.timeIncrement;
		// Add the time back on to the start of the game
		time = time + this.gameStart;
		// convert to a Date object
		time = new Date(time);
		return time;
	}
	
}

/**
 *
 */
class Host{
	constructor(config){
	}
}

const Helpers = {
	
	random: {
		/**
		 * Calculates the 
		 */
		rotating:function(low=0, high=1, mode=null, randFunc=Math.random){
			if(mode === null){
				mode = (low+high)/2;
			}
			if(mode > high) mode = high;
			if(mode < low ) mode = low;
			
			let range = high-low;
			let mRatio = (mode-low) / range;
			let displacement = mRatio - 0.5 + 1;

			let rand = Helpers.random.triangular(0,1,0.5,randFunc);
			rand += displacement;
			rand -= Math.floor(rand);
			
			rand = range*rand + low;
			
			return rand;
		},
		triangular:function(low=0, high=1, mode=null, randFunc=Math.random){
			if(mode === null){
				mode = (low+high)/2;
			}
			if(mode > high) mode = high;
			if(mode < low ) mode = low;
			
			let nums = Array(3).fill(null).map(function(){return randFunc();});
			let rand = nums.reduce((a,d)=>{return a+d;},0) / nums.length;

			let range = null;
			if(rand < 0.5){
				range = mode - low;
			}
			else{
				range = high - mode;
				rand = rand-0.5;
				low = mode;
			}
			rand *=2;
			rand = (rand * range) + low;

			
			return rand;
		},
		testRand:function(rand = null, mode=0.5 , sampleSize = 20,runs=10000){
			if(rand === null){
				rand = Helpers.random.rotating;
			}
			let sample = [];
			for(let i=0; i<sampleSize; i++){
				sample.push(0);
			}
			for(let i=0; i<runs; i++){
				let r = rand(0,1,mode);
				r = Math.floor(r*sample.length);
				sample[r]++;
			}
			return sample;
		}
	}
};


/**
 * Main application class. Mostly static methods that are used to run 
 * the high level game.
 */
class Main{
	
	constructor(config){
		let self = this;
		self.planet = new PopComplete(config["customers"], config["planetregions"]);
		self.now = self.planet.gameTime;
		self.inc = config["timeIncrement"];
	
		self.gamedir = config["path"];
		if (!path.isAbsolute(self.gamedir)){
			self.gamedir = path.join('.', self.gamedir);
		}
		self.state = 'stop';
	}
	
	run(){
		if(this.runner){
			console.warn("already running");
			return;
		}
		let self = this;
		self.state = "run";
		this.runner = setInterval(function(){
			if(self.state !== 'run'){
				clearInterval(self.runner);
				self.runner = null;
				return;
			}
			let active = self.planet.calc_active(self.now);
			process.stdout.write(
				"[{{time}}] {{active}}\r"
					.replace('{{time}}',self.now.toISOString())
					.replace('{{active}}', ('          ' + active.toFixed(0)).substr(-10))
			);

			// Update the simulation time
			self.now = self.planet.gameTime;

		},this.inc);
	}

	help(){
	}

	parse_args(){
	}
	
	async initialize(){
		return Promise.all([
			this.planet.initialize(),
			new Promise((resolve,reject)=>{
				fs.stat(this.gamedir,(err,stat)=>{
					if(err){
						reject(err);
					}
					else{
						resolve(stat);
					}
				});
			})
		]);
	}
}


console.log("Executing 'Keep Alive' ");
const main = new Main(CONFIG);
main.parse_args();
await main.initialize();
main.run();
console.log("Done.");

})();