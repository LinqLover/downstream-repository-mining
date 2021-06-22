var heu = require('heureka');
var heuUtil = require('heureka/util');
var heuUtilSync = require('heureka/utilSync');

var firstWhole = heu.makeWhole("eenie", "meenie", "minie");
console.log(firstWhole.getName());
var somePart = firstWhole.lastPart();
console.log(somePart.name);

var newPart = new heu.Part("hello");
var newWhole = newPart.inNewWhole();
console.log(newWhole.secondaryParts.length);

heuUtil(1, 2, 3).then(console.log);
heuUtilSync.solveKnapsack(1, 2, 3);
