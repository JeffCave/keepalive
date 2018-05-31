'use strict';



if(!JSON.clone) JSON.clone = function(a){
	return JSON.parse(JSON.stringify(a));
};


if(!Array.prototype.random) Array.prototype.randomize = function(){
	for(let i=this.length; i>=0; i--){
		let rand = Math.random() * i;
		let swap = this[rand];
		this[rand] = this[i];
		this[i] = swap;
	}
	return this;
};



if(!console.write) console.write = {
	bufferline: function(line){
		line = line.split('');
		let lastchar = line.pop();
		line = line.join('');
		if(-1 < ['\n','\r'].indexOf(lastchar)){
			line += '                             ';
		}
		line += lastchar;
		return line;
	},
	out: function(line){
		line = this.bufferline(line);
		process.stdout.write(line);
	},
	err: function(line){
		line = this.bufferline(line);
		process.stderr.write(line);
	}
};