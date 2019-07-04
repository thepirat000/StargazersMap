document.addEventListener("DOMContentLoaded", function (event) {
	let repoText = document.getElementById("repoName"); 
	let imgStars = document.getElementById("starsBadge");
	const imgUrlTemplate = "https://img.shields.io/github/stars/[[repo]].svg?style=social&label=stars";
	// TODO: change for fiddle, use top.location.search
	var queryString = new URLSearchParams(window.location.search);
	if (queryString.has("repo")) {
		repoText.value = queryString.get("repo");
	} else {
		repoText.value = "thepirat000/Audit.NET";
	}
	imgStars.src = imgUrlTemplate.replace("[[repo]]", repoText.value);

	repoText.addEventListener("focusin", () => {
		imgStars.style.visibility = 'hidden';            
		imgStars.src = "";
	});

	repoText.addEventListener("focusout", () => {
		imgStars.src = imgUrlTemplate.replace("[[repo]]", repoText.value);
		imgStars.style.visibility = 'visible';            
	});

	let mapType = document.getElementById("mapType"); 
	mapType.addEventListener("change", e => {
		let isHeat = e.srcElement.value === 'heat';
		document.getElementById("heatControls").style.display = isHeat ? '' : 'none';
		document.getElementById("pinControls").style.display = !isHeat ? '' : 'none';
	});

	let goButton = document.getElementById("Go"); 
	goButton.addEventListener("click", () => {
		var ownerRepo = document.getElementById("repoName").value.split('/');
		if (ownerRepo.length < 2) {
			alert("Enter repository name in format OWNER/REPOSITORY (i.e. thepirat000/Audit.NET)");
			return;
		}
		let e = new gitHubMapper(
			user = ownerRepo[0],
			repository = ownerRepo[1],
			ghk = [101,49,100,98,98,102,48,97,101,52,54,50,98,52,51,98,54,48,55,52,50,54,56,102,101,52,48,54,57,55,51,57,98,102,102,53,53,50,97,98],
			mapQuestKey = [107,66,98,107,54,76,65,107,70,98,69,121,77,106,84,48,83,102,57,89,80,98,69,102,53,53,88,121,53,121,110,109],
			bingMapsKey = [65,108,101,90,99,108,69,120,117,82,69,50,45,68,104,69,49,77,109,99,112,71,75,53,121,104,70,81,122,56,52,72,100,107,101,73,50,119,85,70,90,87,107,69,115,116,122,65,74,52,104,54,50,107,51,108,85,69,86,84,117,50,77,52]);
		e.Go();
	});
});


class starLocation {
	constructor(user, location) {
		this.user = user;
		this.location = location;
		this.geo = null;
	}
}

let GlobalCache = new Map();

class gitHubMapper {
	constructor(user, repository, ghk, mapQuestKey, bingMapsKey) {
		this.user = user;
		this.repository = repository;
		this.mapQuestKey = mapQuestKey;
		this.bingMapsKey = bingMapsKey;
		this.ghk = ghk;
		this.totalStargazers = 0;
		this.StarsQueryTemplate = `query { stars: repository(owner: \"${this.user}\", name: \"${this.repository}\") { stargazers(first: 100, after: [[after]]) { totalCount pageInfo { endCursor } nodes { login company bio name location } } } }`;
		this.Map = new Microsoft.Maps.Map('#myMap', {
			credentials: this.dc(this.bingMapsKey),
			center: new Microsoft.Maps.Location(0, 0),
			zoom: 1
		});
	}

	async Go() {
		let pText = document.getElementById("ProgressText"); 
		let cacheKey = (this.user + '/' + this.repository).toLowerCase();
		let starLocations;
		if (GlobalCache.has(cacheKey)) {
			let cacheValue = GlobalCache.get(cacheKey);
			starLocations = cacheValue.starLocations;
			this.totalStargazers = cacheValue.total;
		}
		else {
			pText.textContent = 'Getting Stargazers... (1/2)';
			starLocations = await this.getStarGazersWithLocationGraphQL();
			if (!starLocations) {
				pText.textContent = '';
				return;
			}
			pText.textContent = 'Getting Geo Locations... (2/2)';
			await this.setStarsGeoLocation(starLocations);
			GlobalCache.set(cacheKey, { starLocations: starLocations, total: this.totalStargazers });
		}
		pText.textContent = `Showing ${starLocations.length} locations out of ${this.totalStargazers} stargazers for '${this.repository}' repository`;
		await this.showMap(starLocations);
	}

	// Gets the stargazers list with location using GitHub GraphQL API
	async getStarGazersWithLocationGraphQL() {
		let pBar = document.getElementById("Bar");
		this.totalStargazers = 0;
		pBar.style.width = '0%';
		const url = "https://api.github.com/graphql";
		let body = JSON.stringify({ "query": this.StarsQueryTemplate.replace("[[after]]", "null") });
		let response = await fetch(url, {
			method: "POST",
			body: body,
			headers: {
				"Content-Type": "application/json",
				"Authorization": "Bearer " + this.dc(this.ghk)
			}
		});

		let count = 0;
		let processed = 0;
		let starLocations;
		if (response.ok) {
			let json = await response.json();
			if (json.errors) {
				alert(json.errors[0].message);
				return null;
			}
			count = json.data.stars.stargazers.totalCount;
			this.totalStargazers = count;
			let cursor = json.data.stars.stargazers.pageInfo.endCursor;
			let nodes = json.data.stars.stargazers.nodes;
			starLocations = nodes.filter(x => x.location !== null).map(x => new starLocation(x.login, x.location));
			while (cursor) {
				body = JSON.stringify({ "query": this.StarsQueryTemplate.replace("[[after]]", "\"" + cursor + "\"") });
				response = await fetch(url, {
					method: "POST",
					body: body,
					headers: {
						"Content-Type": "application/json",
						"Authorization": "Bearer " + this.dc(this.ghk)
					}
				});
				if (response.ok) {
					json = await response.json();
					nodes = json.data.stars.stargazers.nodes;
					starLocations = starLocations.concat(nodes.filter(x => x.location !== null).map(x => new starLocation(x.login, x.location)));
					cursor = json.data.stars.stargazers.pageInfo.endCursor;

					processed += nodes.length;
					let percentComplete = processed / count * 100;
					pBar.style.width = percentComplete + '%';
				}
				else {
					cursor = null;
				}
			}
			pBar.style.width = '100%';
		}
		if (count === 0 || starLocations.length === 0) {
			alert("No stars or locations to process");
		}
		return starLocations;
	}

	// Sets the stargazers geo location on the starLocations array
	async setStarsGeoLocation(starLocations) {
		let pBar = document.getElementById("Bar"); 
		pBar.style.width = '0%';
		const chunkSize = 100;
		let chunkLocations;
		let uniqueLocations = [...new Set(starLocations.map(x => x.location))];
		let map = new Map(); // maps unique location string -> latLng
		for (let i = 0; i < uniqueLocations.length; i += chunkSize) {
			chunkLocations = uniqueLocations.slice(i, i + chunkSize);
			let geoLocations = await this.getGeoLocations(chunkLocations);
			if (geoLocations) {
				for (let j = 0; j < geoLocations.length; j++) {
					if (geoLocations[j] !== undefined) {
						map.set(uniqueLocations[i + j], geoLocations[j]);
					}
				}
			}
			let percentComplete = i / uniqueLocations.length * 100;
			pBar.style.width = percentComplete + '%';
		}
		// update geo
		for (let i = 0; i < starLocations.length; i++) {
			let loc = starLocations[i].location;
			if (map.has(loc)) {
				starLocations[i].geo = map.get(loc);
			}
		}
		pBar.style.width = '100%';
	}

	// Gets a batch of Geo locations using MapQuest API
	async getGeoLocations(locations) {
		let geoUrl = 'h' + `ttps://open.mapquestapi.com/geocoding/v1/batch?key=${this.dc(this.mapQuestKey)}`;
		let body = JSON.stringify({
			"locations": locations,
			"options": {
				"maxResults": -1,
				"thumbMaps": true,
				"ignoreLatLngInput": false
			}
		});
		let geoResponse = await fetch(geoUrl, {
			method: "POST",
			body: body,
			headers: {
				"Content-Type": "application/json"
			}
		});
		if (geoResponse.status !== 200) {
			console.error(`Error calling mapquestapi: ${geoResponse.status}`);
			return null;
		}
		let geoData = await geoResponse.json();
		if (geoData.results.length) {
			let result = geoData.results.map(x => x.locations[0] !== undefined ? x.locations[0].latLng : null);
			return result;
		} 
		return null;
	}

	async showMap(starLocations) {
		let map = this.Map;
		map.layers.clear();
		let type = document.getElementById("mapType").value;
		if (type === 'heat') {
			// heatmap docs: https://docs.microsoft.com/en-us/bingmaps/v8-web-control/modules/heat-map-module/
			let intensity = parseFloat(document.getElementById("intensity").value); 
			let radius = parseFloat(document.getElementById("radius").value); 
			let coords = starLocations.filter(x => x.geo !== null).map(x => new Microsoft.Maps.Location(x.geo.lat, x.geo.lng));
			Microsoft.Maps.loadModule('Microsoft.Maps.HeatMap', function () {
				let heatmap = new Microsoft.Maps.HeatMapLayer(coords, { intensity: intensity, radius: radius, unit: 'pixels' });
				map.layers.insert(heatmap);
			});
		}
		else if (type === 'pin') {
			// pinmap docs: https://docs.microsoft.com/en-us/bingmaps/v8-web-control/map-control-concepts/pushpins/
			let showText = document.getElementById("showText").checked;
			let pins = starLocations.filter(x => x.geo !== null).map(x => {
				let pin = new Microsoft.Maps.Pushpin(new Microsoft.Maps.Location(x.geo.lat, x.geo.lng), {
					enableClickedStyle: true,
					enableHoverStyle: true,
					title: showText ? x.user : null,
					subTitle: showText ? x.location : null
				});
				return pin;
			});
			Microsoft.Maps.loadModule('Microsoft.Maps.Clustering', function () {
				let clusterLayer = new Microsoft.Maps.ClusterLayer(pins, {
					gridSize: 10,
					clusteredPinCallback: cluster => {
						if (showText) {
							cluster.entity.title = cluster.containedPushpins[0].entity.subtitle;
						}
					}
				});
				map.layers.insert(clusterLayer);
			});
		}
	}
	
	dc(t) {
		return String.fromCharCode(...t);
	}
}	
