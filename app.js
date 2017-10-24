//******************************
//INTERFACE
//******************************

const LOCALSTORAGE_KEY = "local_markers";
const SCREEN_REZ_BORDER = 600;
const PLACES_SEARCH_RADIUS = '50'; //meters
const START_LOC = {lat: 40.710992, lng: -74.005466}; //the innitial center of the google map
const MAX_NUM_WIKI_LINKS = 5;

//******************************
//	DATA (and functions that directly interact with it)
//******************************

//Stores the actual Google Maps markers at runtime
var markers = [];

//After the user leaves the webpage, the data for the markers he/she has on the map get
//stored in local storage. This data gets loaded when the user returns to the webpage.
//To be memory efficient, only the name and location data for the markers are stored
//this way; that's why I use a separate array here.
var storedMarkerData = [];

//Each observable in this observableArray observes an object with two pieces
//of data of the corresponding marker (i.e. same index) in the markers array:
//	title
//	the marker's index in this array and in the markers array (more on why soon)
//These objects get replaced with up do date ones whenever one of their fields changes.
//This array is filtered (see below function) whenever the text in this app's search
//box changes. An observable array keeps track of the filtered results. This information
//gets fed to the list view, which needs to know a marker's name to display
//it properly in the list. The index in the list is not necessarily the index
//in the original, unfiltered arrays--hence the second field.
var markerNameObjs = ko.observableArray();

//Takes a ko.ViewModel context and a ko.observable string (intended to store the value
//of a search box)
//Returns a computed observable (for the context) that filters the markerNameObjs
//observable array and returns an array of marker names that contain the searchText
//value--or all the names if the searText is an empty string.
function getComputedObsOfMarkers(context, searchText) {
	return ko.computed(function() {
		var text = searchText();
		var filteredObsArray = _.filter(this.markerNameObjs(), function(obj) {
			return text === "" || (obj().name.toLowerCase().includes(text.toLowerCase()));
		}, this);
		showOnlyTheseMarkers(filteredObsArray);
		return filteredObsArray;
	}, context);
}

function getMarkers() {
	return markers;
}

//DATA LOGIC

function addMarker(location, title) {
	var marker = placeMarker(location, title);
	//store the marker
	markers.push(marker);
	storedMarkerData.push({position: marker.position, title: marker.title});
	markerNameObjs.push(ko.observable({name: marker.title,
		originalIndex: markers.length - 1
	}));
	localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(storedMarkerData));
}

function renameMarker(marker, name) {
	var index = markers.indexOf(marker);
	marker.setTitle(name);
	storedMarkerData[index].title = name;
	markerNameObjs()[index]({name: name,
		originalIndex: index
	});
	localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(storedMarkerData));
}

function setMarkerVisibility(marker, visibilityVal) {
	var index = markers.indexOf(marker);
	marker.setVisible(visibilityVal);
	markerNameObjs()[index]({name: marker.getTitle(),
		originalIndex: index
	});
}

function removeMarker(marker) {
	//remove marker from the map
	marker.setMap(null);
	//remove marker from storage
	var index = markers.indexOf(marker);
	markers.splice(index, 1);
	storedMarkerData.splice(index, 1);
	markerNameObjs.splice(index, 1);
	localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(storedMarkerData));
}

//takes an observable array of objects in the same format as the ones from markerNameObjs
//sets the corresponding markers visible and the rest invisible.
function showOnlyTheseMarkers(markerObjArrayOfObs) {
	var indexes = markerObjArrayOfObs.map(function(objObs) {
		return objObs().originalIndex;
	});
	_.each(markers, function(marker, index) {
		setMarkerVisibility(marker, indexes.indexOf(index) > -1);
	});
}

//the app remembers markers from previous sessions and adds them back in on app startup
//via this function
function loadMarkers() {
	var markersJSON = localStorage.getItem(LOCALSTORAGE_KEY);
	//if the local storage doesn't exits, this should be the first time the user
	//is accessing this application. In this case, create the 5 default markers.
	if (!markersJSON) {
		addMarker({lat: 40.7127, lng: -74.0134}, "World Trade Center");
		addMarker({lat: 40.7484, lng: -73.9857}, "Empire State Building");
		addMarker({lat: 40.7548, lng: -73.9774}, "The Roosevelt Hotel");
		addMarker({lat: 40.7587, lng: -73.9787}, "Rockefeller Center");
		addMarker({lat: 40.6892, lng: -74.0445}, "Statue of Liberty");
		return;
	}
	storedMarkerData = JSON.parse(markersJSON);
	_.each(storedMarkerData, function(marker) {
		markers.push(placeMarker(marker.position, marker.title));
		markerNameObjs.push(ko.observable({name: marker.title,
			visible: true,
			originalIndex: markers.length - 1
		}));
	});
}

//takes: an object of the same form as those found in the markerNameObjs observable array
//(not an observable)
//returns: the actual marker object it represents
function convertObjToMarker(obj) {
	return markers[obj.originalIndex];
}

//******************************
//INTERFACE
//******************************

var map; //the google maps map object
var mapDiv = document.getElementById('map'); //the HTML div containing the map
var $mapDiv = $("#map"); //so JQuery can be easily used to get the map div
var markerSearchDiv; //the div containing the marker search box and menu
var renameDiv; //the HTML div containig the interface for renamming the markers
var currentMenu; //can only be one context menu at a time, this var keeps track of it
var currentMarker; //keeps track of which marker is selected
var placesService; //for google places requests
var koVM; //so I have an external reference to the knockout view model
function initMap() {
	//map
	map = new google.maps.Map(mapDiv, {
		center: START_LOC,
		zoom: 14
	});
	//placesService isn't used here, but needs to be defined here because this function
	//is called after the google maps api (used to initialize the variable) is downloaded
	placesService = new google.maps.places.PlacesService(map);
	
	//load markers from local storage
	loadMarkers();
	
	//Help Control
	var helpDiv = document.createElement("DIV");
	helpDiv.innerHTML = "Help";
	helpDiv.title = "Click to view instructions on how to use this app";
	helpDiv.setAttribute("class", "mapControl");
	helpDiv.setAttribute("data-bind", "click: showHelpInfoMenu");
	map.controls[google.maps.ControlPosition.TOP_RIGHT].push(helpDiv);
	
	//Hamburger Button for showing/hiding the list view (button appears on the map)
	var hamDiv = document.createElement("DIV");
	hamDiv.setAttribute("class", "hamBtn");
	hamDiv.innerHTML = '<div class="hamDiv"></div><div class="hamDiv"></div><div class="hamDiv"></div>';
	hamDiv.setAttribute("data-bind", "click: toggleLvDisplay");
	map.controls[google.maps.ControlPosition.LEFT_TOP].push(hamDiv);
	
	//KO View Model - applies to the marker search functionality
	function ViewModel() {
		//lv = list view
		this.lvSearchText = ko.observable("");
		this.markerNameObjs = markerNameObjs;
		this.lvFilteredArray = getComputedObsOfMarkers(this, this.lvSearchText);
		this.helpInfoMenuIsVisible = ko.observable(false);
		this.lvIsVisible = ko.observable(true);
	}
	koVM = new ViewModel();
	ko.applyBindings(koVM, document.getElementById("marker-list-view"));
	ko.applyBindings(koVM, hamDiv);
	ko.applyBindings(koVM, helpDiv);
	ko.applyBindings(koVM, document.getElementById("help-menu"));
	
	//hide the list view if the screen is small
	hideLvIfSmallScreen();
	
	//Map Events
	
	//clicking the map hides all open menus on the map if there are any
	//otherwise, creates a marker at the clicked location
	map.addListener('click', function(event) {
		if (!hideAllMenus()) {
			addMarker(event.latLng, "New Marker");
		}
	});
}
//called if the innitial google maps request fails, displays an error message
function handleMapLoadError() {
	alert("There was an error in obtaining map information from the Google Maps server. The app cannot function without this. Please try again later.");
} 

//MARKER LIST VIEW HIDE/SHOW
//******************************

function screenIsSmall() {
	return window.innerWidth < SCREEN_REZ_BORDER;
}

var lastWindowWidth = window.innerWidth;

//on page load, set display of marker list view of "none" of screen is small
function hideLvIfSmallScreen() {
	if (screenIsSmall()) {
		koVM.lvIsVisible(false);
	}
}

//hide list view when screen goes from big to small, show list view when screen goes
//from small to big (screen size is small or big depending on whether it's thinner
//or wider than SCREEN_REZ_BORDER)
$(window).resize(function() {
	var screenSmall = screenIsSmall();
	if (screenSmall && lastWindowWidth > SCREEN_REZ_BORDER) {
		koVM.lvIsVisible(false);
	} else if (!screenSmall && lastWindowWidth <= SCREEN_REZ_BORDER) {
		koVM.lvIsVisible(true);
	}
	lastWindowWidth = window.innerWidth;
});

function toggleLvDisplay() {
	var lvIsVisible = koVM.lvIsVisible;
	lvIsVisible(!lvIsVisible());
}

//MARKER FUNCTIONS NOT DIRECTLY INVOLVING STORAGE
//******************************

//takes: location and title
//places a marker with the passed location and title, adds a bunch of interactivity (see below
//comments) to the marker, and returns the marker
function placeMarker(location, title) {
	//create the marker on the map
	var marker = new google.maps.Marker({
        position: location, 
        map: map,
		title: title
    });
	//left clicking the marker animates it for a second and shows an info window for it
	//doing this also gets rid of any context menus or info menues currently open
	//see the sections related to those menus for more information
	marker.addListener('click', function () {
		selectMarker(marker);
	});
	return marker;
}

//takes a marker and bounces it for 1.4 seconds (so it bounces exactly twice)
//does nothing if the marker is already being animated
function bounceMarker(marker) {
	if (!marker.getAnimation()) {
		marker.setAnimation(google.maps.Animation.BOUNCE);
		setTimeout(function() {
			marker.setAnimation(null);
		}, 1400);
	}
}

//called when a marker is selected
//takes the selected marker
//removes all currently open menus, sets the marker to the currently selected marker,
//pans to it, bounces it, and opens an info window for it
function selectMarker(marker) {
	hideAllMenus();
	currentMarker = marker;
	infoWindowVM.currentMarkerName(marker.getTitle());
	map.panTo(marker.getPosition());
	openInfoWindowForMarker(marker);
	bounceMarker(marker);
}

function removeCurrentMarker() {
	removeMarker(currentMarker);
	currentMarker = null;
	hideAllMenus();
}

//onclick function for each of the marker options in the marker list on the side
//pans to the marker and selects the marker, bounces the marker for a second,
//and clears map of any currently open menus
//does nothing if the marker is hidden
function markerListClickResponse(data) {
	var marker = convertObjToMarker(data);
	selectMarker(marker);
}

//INFO WINDOW CONTENT
//******************************

var infoWindows = [];
var infoWindowIsOpen = false;
var infoWindowVM = {
	currentMarkerName: ko.observable(""),
	streetViewURL: "",
	placesHTMLObsArray: ko.observableArray() //elements are HTML strings
};

infoWindowVM.currentMarkerName.subscribe(function(newValue) {
	if (infoWindowIsOpen) {
		renameMarker(currentMarker, newValue);
	}
});

//closes the help menu and all the info windows
//returns true if any were actually closed, otherwise returns false
function hideAllMenus() {
	var oneWasHidden = false;
	if (koVM.helpInfoMenuIsVisible()) {
		koVM.helpInfoMenuIsVisible(false);
		oneWasHidden = true;
	}
	_.each(infoWindows, function(infoWindow) {
		infoWindow.close();
		oneWasHidden = true;
	});
	resetInfoWindowData();
	return oneWasHidden;
}

//called whenever infoWindows are closed
function resetInfoWindowData() {
	infoWindowIsOpen = false;
	infoWindows = [];
	infoWindowVM.placesHTMLObsArray = ko.observableArray();
}

//shows the help info menu
function showHelpInfoMenu() {
	koVM.helpInfoMenuIsVisible(true);
}

//hides the help info menu
function hideHelpInfoMenu() {
	koVM.helpInfoMenuIsVisible(false);
}

//content of the infoWindow -- the binding context will be infoWindowVM
var iwContentString =
	'<h1>Edit Marker:</h1>' +
	'<div id="current-iw-content">' +
	'<div style="font-size: 20px;">' +
		'Name:<br><input type="text" style="background-color: #ffe; font-size: 20px;" data-bind="value: currentMarkerName">' +
		' | <span style="text-decoration: underline; color: blue;" data-bind="click: removeCurrentMarker">Delete</span>' +
	'</div>' +
	'<div class="centerAlign" style="margin-top: 10px;">' +
		'<img data-bind="attr: {src: streetViewURL}"/>' +
	'</div>' +
	'<h1>Places near this marker:</h1>' +
	'<section data-bind="foreach: placesHTMLObsArray">' +
		'<div data-bind="html: $data"></div>' +
	'</section>' +
	'</div>';

//Renders an info window for the passed marker containing a Google Maps StreetView inage
//from near the marker's location and wikipedia links for nearby places.
function openInfoWindowForMarker(marker) {	
	var location = marker.getPosition();
	var streetViewURL = "https://maps.googleapis.com/maps/api/streetview?size=450x250&location=" + location.lat() + "," + location.lng() + "&fov=120";
	var request = {
		location: location,
		radius: PLACES_SEARCH_RADIUS
	};
	//searches for nearby places, puts them in "results", and then calls the callback
	placesService.nearbySearch(request, function(results, status) {
		//if no nearby places, make sure results array exists and is empty so template
		//can handle error
		var places = status == google.maps.places.PlacesServiceStatus.OK ? results : [];
		infoWindowVM.streetViewURL = streetViewURL;
		infoWindowVM.places = places;
		var infoWindow = new google.maps.InfoWindow({
			content: iwContentString
		});
		//so app knows that no info windows are open and other functions operate
		//correctly when an infoWindow is closed
		infoWindow.addListener('closeclick', resetInfoWindowData);
		//because info windows open asynchronously--ko.applyBindings needs to be in this
		//callback
		infoWindow.addListener('domready', function() {
			ko.applyBindings(infoWindowVM, document.getElementById("current-iw-content"));
			infoWindowIsOpen = true;
		});
		infoWindows.push(infoWindow);
		infoWindow.open(map, marker);
		//asynchronously render the proper HTML (including Wikipedia links) for each
		//of the places
		if (places.length > 0) {
			_.each(places, function(place) {
				renderPlaceHTML(place);
			});
		} else {
			//handling 0 places case (could also be Google Maps request error) here
			//instead of in HTML because the HTML doesn't seem to update  when places are
			//if I handle this with data-bind: if and reference the observable array
			//for some reason.
			infoWindowVM.placesHTMLObsArray.push(
				'<div style="font-size: 20px;">' +
					'No nearby places found' +
				'</div>'
			 );
		}
	});
}

//takes a google.maps.place
//handles acquireing the Wikipedia links and rendering the HTML in the info window for
//this place.
function renderPlaceHTML(place) {
	var placeName = place.name;
	var wikiApiUrl = 'https://en.wikipedia.org/w/api.php?action=opensearch&search=' + placeName + '&format=json&callback=?';
	var pageNames;
	var name;
	var url;
	var linkArray = [];
	
	$.ajax( wikiApiUrl, {
		dataType: 'jsonp'
	}).done(function(data) {
		pageNames = data[1];
		if (pageNames.length === 0) {
			linkArray.push("No related Wikipedia links available");
		} else {
			if (pageNames.length > MAX_NUM_WIKI_LINKS) {
				pageNames = pageNames.slice(0, MAX_NUM_WIKI_LINKS);
			}
			for (var j = 0; j < pageNames.length; j++) {
				name = pageNames[j];
				url = "https://en.wikipedia.org/wiki/" + name;
				linkArray.push('<div><a href="'+url+'" target="_blank">'+name+'</a> (Attribution: '+url+')</div>');
			}
			updatePlacesHTML(placeName, linkArray);
		}
	}).fail(function() {
		linkArray.push('<div>There was an error in loading the Wikipedia links.</div>');
		updatePlacesHTML(placeName, linkArray);
	});
}

//adds HTML to infoWindowVM.placesHTMLObsArray--an observable array that is data bound
//via foreach in the main info window html--thereby adding a new place and links to
//the info window
function updatePlacesHTML(placeName, linkArray) {
	//Google search link--this is always added
	linkArray.push('<div>Google Search: <a href="https://www.google.com/search?q='+placeName+'" target="_blank">'+placeName+'</a></div>');
	//update observable array--and therefore info window
	infoWindowVM.placesHTMLObsArray.push(
		'<div style="font-size: 20px;">'+placeName+'</div>' +
		'<div class="placesLinksMenu">'+linkArray.join("")+'</div><br>'
	);
}