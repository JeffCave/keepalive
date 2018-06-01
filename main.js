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
require('./lib/utils.js');

(async function(){

'use strict';


const fs = require('fs');
const sqlite = require('better-sqlite3');
const path = require('path');
const moment = require('moment');

const CONFIG = {
	"path": "game",
	"customers": 10,
	"planetregions": {"lat": 10, "lng": 10},
	// rate at which game times should accelerate beyond real-time.
	"timeRate": 61,
	"tickSize": 500,
	// Income we earn from a given person per month
	"income":1,
	// Cost of a server per month
	"cost":30
};


const millisPer = {};
millisPer.Day = 24 * 60 * 60 * 1000;
millisPer.Year = millisPer.Day * 365.25;
millisPer.Week = millisPer.Year / 52;
millisPer.Month = millisPer.Year / 12;
//millisPer = Object.seal(millisPer);


const DATACENTERS = {
	"Europe": {
		"city": "Dublin, Ireland",
		"coords": [53.348429, -6.282792]
	},
	"Asia": {
		"city": "Hong Kong, China",
		"coords": [22.348683, 114.144128],
	},
	"North America": {
		"city": "New York, USA",
		"coords": [40.748343, -73.985474],
	}
};



/**
 * Represents a gridded population group within our map. This allows
 * us to estimate how many people within a region are becomming
 * active, and what the closest datacenter shoudl be.
 */
class PopRegion{
	constructor(boundaries,isHome=false){
		let self = this;
		self.bound = boundaries;

		let lat = (this.bound['n'] + this.bound['s']) / 2;
		let lng = (this.bound['e'] + this.bound['w']) / 2;
		this.center = [lng,lat];
		this.center.lat = lat;
		this.center.lng = lng;

		self.population = 0;
		self.area = 0;
		self.pop_ratio = 0.0;
		self.customers = 0;
		this.isHome = isHome;
	}

	contains(lat, lng){
		if(Array.isArray(lat)){
			lng = lat[1];
			lat = lat[0];
		}
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

	get timezone(){
		let zone = this.center.lng;
		// add 180 degrees (span is negative to positive)
		zone += 180;
		// find the ratio of a circle
		zone /= 360;
		// convert to hours
		zone *= 24;
		return zone;
	}

	/**
	 * Calculates the number of active people
	 *
	 * Based on the game time, it will calculate a random number of people that
	 * are to be considered active and about. This is primarily based on time
	 * of day.
	 */
	calcActive(sym_time){
		let active = {
			people: 0,
			customers:0
		};
		if(this.population === 0){
			return active;
		}
		let timezone = this.timezone;
		let localRotationalTime = moment(sym_time)
			.add(timezone,'hours')
			.year(1970)
			.month(0)
			.date(1)
			.valueOf()
			;
		localRotationalTime /= millisPer.Day;
		let lower = 1;
		let upper = this.population;
		let mode = localRotationalTime * (upper-lower);

		active.people = Helpers.random.solar(lower,upper,mode);
		active.people = Math.floor(active.people);

		active.customers = active.people / this.population;
		active.customers *= this.customers;
		active.customers = Math.floor(active.customers);
		// if this is our home region, we always have one customer, because
		// Mom loves us.
		if(this.isHome && active.customers < 1){
			active.customers = 1;
		}

		return active;
	}

}


/**
 * The entire customer base of planet earth.
 */
class PopComplete{

	constructor(customers, region_count){
		console.write.err("Creating the planet ... \r");
		this.gameStart = Date.now();
		this.population = 0;
		this.customers = customers;

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

				console.write.err(`Creating the planet [${lat},${lng}] \r`);
			}
		}

		console.write.err('Created the planet. \n');


		let recs = 0;

		// Calculate the number of customers we have in a given region
		// This number should be based off of data from NASA regarding
		// population density
		let self = this;
		let db = new sqlite('gpwv.sqlite');
		let query = db.prepare([
						'select ifnull(sum(population),0) as pop ',
						'from   planet ',
						'where  lat >= :s and lat < :n and ',
						'       lon >= :w and lon < :e '
					].join('\n'));
		let displayFreq = Math.floor(this.regions.length/100);
		this.regions.forEach((region)=>{
			let row = query.get(region.bound);
			region.population = row.pop;
			self.population += region.population;
			if (recs === 0){
				let pop = Math.floor(self.population / 1000000);
				console.write.err("Populating Planet... {{population}} million \r".replace('{{population}}',pop));
			}
			recs = (recs + 1) % displayFreq;

		});
		db.close();
		self.population = Math.round(self.population);
		let pop = Math.floor(self.population / 1000000);
		self.regions.forEach(function(region){
			region.population = Math.round(region.population);
			region.pop_ratio = region.population / self.population;
			region.customers = Math.floor(region.pop_ratio * self.customers);
		});
		console.write.err("Populated Planet. {{population}} million \n".replace('{{population}}',pop));

		let habitable = this.regions.filter(function(d){
			return d.population > 0;
		});
		this.homeRegion = Math.floor(Math.random() * habitable.length);
		this.homeRegion = habitable[this.homeRegion];
		this.homeRegion.isHome = true;

		this.gameStart = Date.now();
		return this;
	}

	calcActive(sym_time = this.gameTime){
		let active = this.regions.reduce(function(a,region){
			let active = region.calcActive(sym_time);
			a.regions.push(active);
			a.people += active.people;
			a.customers += active.customers;
			return a;
		},{people:0,customers:0,regions:[]});
		return active;
	}

	get active(){
		return this.calcActive();
	}

	get gameTime(){
		// Get the current real time
		let time = Date.now();
		// determine how much real time has passed since the game started
		time = time - this.gameStart;
		// Apply the time factor as specified in the configuration
		time = time*CONFIG.timeRate;
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
class Providers{
	constructor(planet){
		this.planet = planet;

		// lookup our standard datacenters
		// these ones will always exist because Amazon is a giant company
		this.datacenters = Object.entries(DATACENTERS).map((d)=>{
			let center = JSON.clone(d[1]);
			center.name = d[0];
			return center;
		});
		// create "Mom" hosting. Will always exist because ... mom
		this.datacenters.unshift({
			"name": "Mom's Basement",
			"coords": JSON.clone(this.planet.homeRegion.center),
		});
		// these centers will always exist
		this.FIXEDCENTERS = this.datacenters.length;

		// lookup some reasonable places to create new datacenters in case
		// we want to dynamically create some later
		let db = new sqlite('gpwv.sqlite');
		let sql = 'select country as "name", lon, lat from planet order by (population/area) desc limit  100';
		db.prepare(sql).all().forEach((row)=>{
				this.datacenters.push({
					"name": row.name,
					"coords":[row.lon,row.lat]

				});
			});
		db.close();

		// now that we have all of our centers, initialize the values
		// generally, the data centers are mom/pop shops
		this.datacenters.forEach(center=>{
			center.capacity = 1000;
			center.max = 100;
			center.price = CONFIG.cost;
			center.active = false;
		});

		// the first few are really big companies
		this.datacenters.slice(0,this.FIXEDCENTERS).forEach((center)=>{
			// there servers can handle volume
			center.capacity = 1000;
			// there is no end to their servers
			center.max = Number.MAX_SAFE_INTEGER;
			center.price = CONFIG.cost;
			center.active = true;
		});

		// home is a very special case
		this.home = this.datacenters[0];
		// its capacity should be just enough that you can almost acquire the
		// next tier
		this.home.capacity = 100;
		this.home.max = 1;
		this.home.price = 0;
		this.home.active = true;
	}

}


const Helpers = {

	random: {
		/**
		 *
		 *
		 */
		solar:function(low=0,high=1,mode=0.5,randFunc=Math.random){
			if(mode === null){
				mode = (low+high)/2;
			}
			if(mode > high) mode = high;
			if(mode < low ) mode = low;

			let mRatio = (mode-low) / (high-low);
			let target = 1 - (Math.cos(mRatio*2*Math.PI)+1);

			let rand = Helpers.random.rotating(0,1,target,randFunc);

			rand = rand * (high-low) + low;
			return rand;
		},
		rotate:function(point,mode){
			if(mode > 1) mode = 1;
			if(mode < 0 ) mode = 0;

			let displacement = mode - 0.5 + 1;

			point += displacement;
			point -= Math.floor(point);

			return point;
		},
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

			let nums = Array(3).fill(null).map(()=>{return randFunc();});
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
	},
	/**
	 * Calculates the distance between the two points on the earth surface
	 *
	 * TODO: actually base it on circular distance
	 * https://en.wikipedia.org/wiki/Great-circle_distance
	 */
	GreatDist:function(a,b){
		let lng = Math.abs(b[0] - a[0])**2;
		let lat = Math.abs(b[1] - a[1])**2;
		let dist = (lng+lat)**0.5;
		return dist;
	}
};


/**
 * Main application class. Mostly static methods that are used to run
 * the high level game.
 */
class Main{

	constructor(config){
		this.gamedir = config["path"];
		if (!path.isAbsolute(this.gamedir)){
			this.gamedir = path.join('.', this.gamedir);
		}

		this.planet = new PopComplete(config["customers"], config["planetregions"]);
		this.providers = new Providers(this.planet);
		this.now = this.planet.gameTime;
		this.inc = config["timeIncrement"];
		this.account = 10;
		this.income = config.income / this.timeScale;

		this.timeScale = (config.tickSize*config.timeRate);
		this.tickFreq = config.tickSize;
		this.state = 'stop';
	}

	run(){
		if(this.runner){
			console.warn("already running");
			return;
		}
		this.state = "run";
		this.runner = setInterval(()=>{
			if(this.state !== 'run'){
				clearInterval(this.runner);
				this.runner = null;
				return;
			}
			// Update the simulation time
			let now = this.planet.gameTime;
			let active = this.planet.calcActive(now);
			active.peopleRatio = active.people / this.planet.population;
			active.customerRatio = active.customers / this.planet.population;

			let providers = this.providers.datacenters
				.filter(center=>{
					return center.active;
				})
				.reduce((a,d)=>{
					a[d.name] = d;
					return a;
				},{})
				;



			// STEP 1: Configure servers as per config files
			let state = this.customerConfig;
			state.active = active;
			state.hosts = state.order.map(host=>{
				// find the provider
				let provider = providers[host.provider];
				if(!provider || !provider.active){
					return null;
				}
				// provisioned
				let prov = JSON.clone(provider);
				prov.provider = host.provider;
				prov.quantity = Math.min(host.quantity,provider.max);
				prov.cost = prov.quantity * prov.price;
				prov.capacity = provider.capacity * prov.quantity;
				prov.unallocated = prov.capacity;
				return prov;
			})
			.filter(host=>{
				return (!!host);
			})
			;

			// STEP 2: Pre-pay all your hosting bills
			state.hosts.forEach(host=>{
				host.paid = Math.min(host.cost,this.account);
				this.account -= host.paid;
			});

			// STEP 3: allocate services to active users
			this.allocateUsersToHosts(state);

			// STEP 4: Apply catastrophies: bill went negative? earthquake?
			state.hosts
				.filter(host=>{
					return host.paid !== host.price;
				})
				.forEach(host=>{
					state.allocationMap.filter(map=>{
						map.host = null;
					});
				})
				;
			
			// STEP 5: calculate the distribution of happy, mediocre, and unhappy
			// users will be happy across a normal distribution, the real trick is
			// to move the modal value to the right (increasing the number happy people)
			// The number of people that were supported by a host that experienced
			// catastrophe are instantly (100%) disatisfied
			state.allocationMap.forEach((cust)=>{
				let satisfaction = (cust.dist / 1) - 0.5;
				let newCustomers = satisfaction * cust.count;
				cust.region.customers += newCustomers;
			});


			console.write.out(
				"[{{time}}] {{active}} of {{pop}} ({{pct}}%) \r"
					.replace('{{time}}',now.toISOString().substring(0,19))
					.replace('{{active}}', active.customers.toFixed(0))
					.replace('{{pop}}', this.planet.population.toFixed(0))
					.replace('{{pct}}', (active.customerRatio*100).toFixed(1))
			);
		},this.tickFreq);
	}

	get customerConfig(){
		let rtn = {
			'order':[
					{
						provider:"Mom's Basement",
						quantity:1
					}
				]
		};
		return rtn;
	}
	
	/**
	 * Performes a mapping between users and hosts, then routes customers
	 * to an appropriate host.
	 */
	allocateUsersToHosts(state){
		let hosts = state.hosts;
		state.allocationMap = [];
		state.active.regions.forEach(region=>{
			if(region.customers === 0){
				return;
			}
			region.unallocated = region.customers;
			hosts.sort((a,b)=>{
				let aDist = Helpers.GreatDist(region.coords,a.coords);
				let bDist = Helpers.GreatDist(region.coords,b.coords);
				return bDist - aDist;
			});
			while(hosts.length > 0 && region.unallocated > 0){
				let host = hosts[0];
				if(host.unallocated > 0){
					let allocate = Math.min(host.unallocated,region.unallocated);
					host.unallocated -= allocate;
					region.unallocated -= allocate;
					state.allocationMap.push({
						region: region,
						host:host,
						count:allocate,
						dist:Helpers.GreatDist(region.coords,host.coords),
					});
				}
				if(host.unallocated == 0){
					hosts.pop();
				}
			}
			if(region.unallocated > 0){
				state.allocationMap.push({
					region: region,
					host:null,
					count:region.unallocated,
					dist:Helpers.GreatDist([-180,-90],[180,90]),
				});
			}
		});

	}

	help(){
	}

	parse_args(){
	}

	async initialize(){
		Promise.all([
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

})();
