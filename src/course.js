/* The Utrecht course: 10 pubs and 8 Albert Heijns, no restaurants.
   Times assume a Saturday; addresses and Saturday hours come from Google Maps
   listings checked on 9 November 2026.
   kind: "pub" or "ah". AH holes are the cheap ones: buy the drink in the shop and finish it outside.
   Optional per hole: unit:"bite" for food holes, water:1 for water hazards. */
const CITY = "Utrecht";

const HOLES = [
  {n:1,  t:"14:30", kind:"pub", name:"Café Weerdzicht", addr:"Oudegracht 1", drink:"Vaasje pils", par:1, lat:52.0960844, lng:5.1159053, pid:"ChIJ7YJP4UNvxkcRmMa2JtT9NK8"},
  {n:2,  t:"14:55", kind:"ah",  name:"AH Voorstraat", addr:"Voorstraat 38", drink:"Can of AH pils, shared", par:1, lat:52.0947869, lng:5.1198609, pid:"ChIJx6giSkRvxkcR4VOkbTxtmNo"},
  {n:3,  t:"15:10", kind:"pub", name:"Café Voortuin", addr:"Voorstraat 4", drink:"Witbier", par:1, lat:52.0937962, lng:5.118385, pid:"ChIJI-ifYERvxkcRMeCHDuLTXhA"},
  {n:4,  t:"15:30", kind:"ah",  name:"AH Neude", addr:"Potterstraat 1", drink:"Half-litre can of Hertog Jan, shared", par:1, lat:52.0933358, lng:5.1175888, pid:"ChIJUw8IfUNvxkcR-0qX27R5c44"},
  {n:5,  t:"15:45", kind:"pub", name:"Café 't Neutje", addr:"Neude 30", drink:"Jenever, one each", par:1, lat:52.0926785, lng:5.1185176, pid:"ChIJq1ZC7ERvxkcRYrNCaL2830g"},
  {n:6,  t:"16:10", kind:"ah",  name:"AH Vredenburgplein", addr:"Vredenburgplein 4", drink:"Can of Desperados, shared", par:1, lat:52.0916714, lng:5.1144433, pid:"ChIJQZBH77FvxkcRQuInKwU17iA"},
  {n:7,  t:"16:25", kind:"pub", name:"Little Dublin", addr:"Mariaplaats 8", drink:"Half pint of Guinness", par:1, lat:52.0899657, lng:5.1177255, pid:"ChIJjWakrWJvxkcRQ1WQONtY5ZI"},
  {n:8,  t:"16:50", kind:"ah",  name:"AH Hoog Catharijne", addr:"Godebaldkwartier 149", drink:"Mini bottle of wine (187 ml), shared", par:1, lat:52.0894602, lng:5.1130743, pid:"ChIJXTYH41xvxkcR1ErwF_oC0EE"},
  {n:9,  t:"17:05", kind:"ah",  name:"AH Stationsplein", addr:"Stationsplein 24", drink:"Half-litre can of Grolsch, shared. Buy your dinner here too", par:1, lat:52.0908567, lng:5.1104125, pid:"ChIJl4KWKnNvxkcRcvnuFvHM3-Y",
   breakAfter:"Dinner break until 18:05. Eat the broodje you bought at AH Stationsplein, then walk to the Lijnmarkt."},
  {n:10, t:"18:05", kind:"pub", name:"The Postillon", addr:"Lijnmarkt 50", drink:"Opponents pick your beer", par:1, lat:52.0892126, lng:5.1209623, pid:"ChIJi5WflFpvxkcRYSzx0ZpvJBk"},
  {n:11, t:"18:25", kind:"pub", name:"Kafé België", addr:"Oudegracht 196", drink:"Belgian tripel", par:1, lat:52.0890331, lng:5.1215848, pid:"ChIJW5MOkVpvxkcRDYqgo2pLGBY"},
  {n:12, t:"18:55", kind:"ah",  name:"AH Twijnstraat", addr:"Twijnstraat 10", drink:"Can of Amstel Radler, shared", par:1, lat:52.083487, lng:5.1234737, pid:"ChIJn-JPc1dvxkcRLqXZhll6vBg"},
  {n:13, t:"19:25", kind:"ah",  name:"AH Nachtegaalstraat", addr:"Nachtegaalstraat 55", drink:"Bottle of Corona, shared", par:1, lat:52.0915793, lng:5.1313645, pid:"ChIJJ4G36k1vxkcRr5wL80OqFWI"},
  {n:14, t:"19:45", kind:"pub", name:"Mick O'Connells", addr:"Jansdam 3", drink:"Cider", par:1, lat:52.0925472, lng:5.1226417, pid:"ChIJ1fOaZUVvxkcRvx-WJgUtiNg"},
  {n:15, t:"20:15", kind:"ah",  name:"AH Biltstraat", addr:"Biltstraat 90", drink:"Bacardi Breezer, shared", par:1, lat:52.0954229, lng:5.1307022, pid:"ChIJC1eM4fdvxkcR7dck8TAzQ4E"},
  {n:16, t:"20:35", kind:"pub", name:"Florin", addr:"Nobelstraat 2", drink:"Fruit beer", par:1, lat:52.0932533, lng:5.1240435, pid:"ChIJWXf6gk9vxkcRHTIzf0-2KDs"},
  {n:17, t:"20:55", kind:"pub", name:"Bar Vivid", addr:"Nobelstraat 207", drink:"Shot, one each", par:1, lat:52.0929359, lng:5.1250242, pid:"ChIJjZmtJABvxkcR9Rv4wRdcZ2U"},
  {n:18, t:"21:15", kind:"pub", name:"Café 't Pandje", addr:"Nobelstraat 193", drink:"Shared pint", par:1, lat:52.092951, lng:5.1249422, pid:"ChIJVwKLoU9vxkcRp-s_Y8R3cq4"}
];

/* Map decoration: the canal through the centre and a few street names. */
const CANAL = { name: "Oudegracht", label: [52.0957, 5.1146], points: [
  [52.0975, 5.1150], [52.0961, 5.1160], [52.0946, 5.1172], [52.0932, 5.1181], [52.0920, 5.1189],
  [52.0908, 5.1199], [52.0897, 5.1210], [52.0889, 5.1218], [52.0878, 5.1226], [52.0855, 5.1232], [52.0830, 5.1240]
] };
const STREETS = [
  ["Neude", 52.0922, 5.1172], ["Janskerkhof", 52.0946, 5.1226], ["Nobelstraat", 52.0940, 5.1268],
  ["Mariaplaats", 52.0889, 5.1170], ["Domtoren", 52.0906, 5.1226], ["Centraal", 52.0885, 5.1128],
  ["Biltstraat", 52.0963, 5.1290], ["Twijnstraat", 52.0842, 5.1212]
];
