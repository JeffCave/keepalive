'use strict';
import * as assert from 'assert';
import Helpers from 'main.js';

define("helpers",function(){
	it('should contain mocha test', function() {
		assert.ok(true);
	});
	
	define('Random Generators',function(){
		it('Curved Random', function() {
			this.skip('not implemented');
			
			Helpers.random.testRand(Helpers.random.rotating,0.75).forEach(function(d){
				console.log(d);
			});
		});
	});
});
