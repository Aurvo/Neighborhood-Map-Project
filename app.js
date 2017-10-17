//******************************
//INTERFACE
//******************************

const CTXT_MENU_ID = "ctxt-menu";
const MARKER_SEARCH_ID = "marker-search";
const LOCALSTORAGE_KEY = "local_markers";
const SCREEN_REZ_BORDER = 600;
const PLACES_SEARCH_RADIUS = '250'; //meters

//******************************
//	DATA (and functions that directly interact it)
//******************************

//Stores the actual Google Maps markers at runtime
var markers = [];

//After the user leaves the webpage, the data for the markers he/she has on the map get
//stored in local storage. This data gets loaded when the user returns to the webpage.
//To be memory efficient, only the name and location data for the markers are stored
//this way; that's why I use a separate array here.
var storedMarkerData = [];

//Each observable in this observableArray observes an object with three pieces
//of data of the corresponding marker (i.e. same index) in the markers array:
//	title
//	visibility on the map
//	the marker's index in this array and in the markers array (more on why soon)
//These objects get replaced with up do date ones whenever one of their fields changes.
//This array is filtered (see below function) whenever the text in this app's search
//box changes. An observable array keeps track of the filtered results. This information
//gets fed to the list view, which needs to know a marker's name and visibility
//to display it properly in the list. The index in the list is not necessarily the index
//in the original, unfiltered arrays--hence the third field.
var markerNameObjs = ko.observableArray();

//Takes a ko.ViewModel context and a ko.observable string (intended to store the value
//of a search box)
//Returns a computed observable (for the context) that filters the markerNameObjs
//observable array and returns an array of marker names that contain the searchText
//value--or all the names if the searText is an empty string.
function getComputedObsOfMarkers(context, searchText) {
	return ko.computed(function() {
		var text = searchText();
		return _.filter(this.markerNameObjs(), function(obj) {
			return text == "" || (obj().name.toLowerCase().includes(text.toLowerCase()));
		}, this);
	}, context);
}

//DATA LOGIC

function addMarker(location, title) {
	var marker = placeMarker(location, title);
	//store the marker
	markers.push(marker);
	storedMarkerData.push({position: marker.position, title: marker.title});
	markerNameObjs.push(ko.observable({name: marker.title,
		visible: true,
		originalIndex: markers.length - 1
	}));
	localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(storedMarkerData));
}

function renameMarker(marker, name) {
	var index = markers.indexOf(marker);
	marker.setTitle(name);
	storedMarkerData[index].title = name;
	markerNameObjs()[index]({name: name,
		visible: marker.getVisible(),
		originalIndex: index
	});
	localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(storedMarkerData));
}

function setMarkerVisibility(marker, visibilityVal) {
	var index = markers.indexOf(marker);
	marker.setVisible(visibilityVal);
	markerNameObjs()[index]({name: marker.getTitle(),
		visible: visibilityVal,
		originalIndex: index
	});
}

function removeMarker(marker) {
	//remove marker from the map
	removeMarkerOnMap(marker);
	//remove marker from storage
	var index = markers.indexOf(marker);
	markers.splice(index, 1);
	storedMarkerData.splice(index, 1);
	markerNameObjs.splice(index, 1)
	localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(storedMarkerData));
}

//the app remembers markers from previous sessions and adds them back in on app startup
//via this function
function loadMarkers() {
	var markersJSON = localStorage.getItem(LOCALSTORAGE_KEY);
	//if the local storage doesn't exits, this shoudl be the first time the user
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
var startLoc = {lat: 40.710992, lng: -74.005466}; //the innitial center of the google map
var pixelCoordX = 0; //x coordinate for context menus
var pixelCoordY = 0; //y coordinate for context menus
var currentMenu; //can only be one context menu at a time, this var keeps track of it
var currentMarker; //keeps track of which marker to rename
var placesService; //for google places requests
function initMap() {
	//map
	map = new google.maps.Map(mapDiv, {
		center: startLoc,
		zoom: 14
	});
	//placesService isn't used here, but needs to be defined here because this function
	//is called after the google maps api (used to initialize the variable) is downloaded
	placesService = new google.maps.places.PlacesService(map);
	
	//Help Control
	var helpDiv = document.createElement("DIV");
	helpDiv.innerHTML = "Help";
	helpDiv.title = "Click to view instructions on how to use this app";
	helpDiv.setAttribute("class", "mapControl");
	helpDiv.addEventListener("click", showHelpInfoMenu);
	
	map.controls[google.maps.ControlPosition.TOP_RIGHT].push(helpDiv);
	
	//load markers from local storage
	loadMarkers();
	
	//KO View Model - applies to the marker search functionality
	function ViewModel() {
		this.lvSearchText = ko.observable("");
		this.markerNameObjs = markerNameObjs;
		this.lvFilteredArray = getComputedObsOfMarkers(this, this.lvSearchText);
	}
    ko.applyBindings(new ViewModel());
	
	//Hamburger Button for showing/hiding the list view (button appears on the map)
	$mapDiv.append(hamburgerTemp());
	
	//Rename Marker Center Control
	renameDiv = document.createElement("DIV");
	renameDiv.innerHTML = renameTemp();
	renameDiv.setAttribute("class", "mapControl");
	renameDiv.style.textAlign = "left";
	renameDiv.style.width = "250px";
	renameDiv.style.cursor = "auto";
	renameDiv.style.display = "none";
	map.controls[google.maps.ControlPosition.CENTER].push(renameDiv);
	
	//Map Events
	
	//right clicking map renders context menu allowing the user to add a new marker
	map.addListener('rightclick', function(event) {
		createContextMenu(event.latLng, {name: "Addd Marker", eventFunction: function (event) {
			addMarker(this.location, "New Marker");
		}});
	});
	
	//clicking the map removes the currently open context menu if there is one
	//also hides all info menus
	map.addListener('click', function(event) {
		removeCurrentMenu();
		hideAllInfoMenus();
	});
}

//MARKER LIST VIEW HIDE/SHOW
//******************************

function screenIsSmall() {
	return window.innerWidth < SCREEN_REZ_BORDER;
}

var lastWindowWidth = window.innerWidth;
var $listView = $("#marker-list-view");

//on page load, set display of marker list view of "none" of screen is small
if (screenIsSmall()) {
	listView.hide();
}

//hide list view when screen goes from big to small, show list view when screen goes
//from small to big (screen size is small or big depending on whether it's thinner
//or wider than SCREEN_REZ_BORDER)
$(window).resize(function() {
	var screenSmall = screenIsSmall();
	if (screenSmall && lastWindowWidth > SCREEN_REZ_BORDER) {
		$listView.hide();
	} else if (!screenSmall && lastWindowWidth <= SCREEN_REZ_BORDER) {
		$listView.show();
	}
	lastWindowWidth = window.innerWidth;
});

//toggles the display of the left marker list view menu
//can't use JQuery's toggle() method because that doesn't work with my media query
//for the list view well.
function toggleLvDisplay() {
	$listView.toggle();
}

//TEMPLATE FUNCTIONS
//******************************

//Template function for a list of items--usually based on other templates.
//This template is used in several other templates in this app.
var listTemp = _.template($("#list-temp").html());

//template for marker info windows--the ones that open when the markers are LEFT clicked
var infoWindowTemp = _.template($("#info-window").html());

//template for the hamburger button used to hide/show the marker list view
var hamburgerTemp = _.template($("#hamburger-temp").html());

//template for the center control rename form
var renameTemp = _.template($("#rename-temp").html());

//template for a button in a context menu
var ctxtBtnTemp = _.template($("#ctxt-btn-temp").html());

//templates for the contents of the marker info pane (see below function) and a single
//nearby place (to the marker) mentioned in that pane. The bottom template uses the top.
var singlePlaceTemp = _.template($("#single-place-temp").html());
var markerInfoTemp = _.template($("#marker-places-temp").html());

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
		removeCurrentMenu();
		hideAllInfoMenus();
		bounceMarker(marker);
		openInfoWindowForMarker(marker);
	});
	//right clicking the marker renders a context menu with options to rename, remove,
	//and analyze the geographical area around the marker
	marker.addListener('rightclick', function(event) {
		currentMarker = marker;
		createContextMenu(event.latLng,
		{name: "Rename Marker", eventFunction: function(event) {
			innitiateRenameMarker(marker);
		}}, 
		{name: "Remove Marker", eventFunction: function(event) {
			removeMarker(marker);
		}},
		{name: "Analyze Surrounding Area", eventFunction: function(event) {
			renderMarkerInfoMenu(marker);
		}});
	});
	return marker;
}

function removeMarkerOnMap(marker) {
	marker.setMap(null);
}

function openInfoWindowForMarker(marker) {
	var location = marker.getPosition();
	var infowindow = new google.maps.InfoWindow({
		content: infoWindowTemp({
			name: marker.getTitle(),
			lat: location.lat(),
			lng: location.lng()
		})
	});
	infowindow.open(map, marker);
}

//for hiding/showing sets of markers.
//Takes an array of markers, a boolean value that's false if the markers should be hidden
//--true otherwise--and a third parameter...
//if the third argument is true, assumes that the passed array is the lvFilteredArray
//computed observable and that it must be converted into an array of markers
//(does not alter the observable, alters the argument)
function setMarkersVisibility(markerArray, visibilityVal, mustConvert=false) {
	if (mustConvert) {
		var objArray = markerArray;
		markerArray = [];
		_.each(objArray, function(objObs) {
			markerArray.push(convertObjToMarker(objObs()));
		});
	}
	_.each(markerArray, function(marker) {
		setMarkerVisibility(marker, visibilityVal)
	});
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

//onclick function for each of the marker options in the marker list on the side
//pans to the marker and selects the marker, bounces the marker for a second,
//and clears map of any currently open menus
//does nothing if the marker is hidden
function markerListClickResponse(data) {
	var marker = convertObjToMarker(data);
	if (marker.getVisible()) {
		removeCurrentMenu();
		hideAllInfoMenus();
		map.panTo(marker.getPosition());
		openInfoWindowForMarker(marker);
		bounceMarker(marker);
	}
}

//CENTER CONTROL
//******************************

//Takes a marker
//Reveals the center control for renaming markers. Uses the name of the passed marker
//as the default text of the control's input box.
//Note: code for keeping track of  which marker to rename is in the placeMarker function.
function innitiateRenameMarker(marker) {
	renameDiv.style.display = "initial";
	document.getElementById("rename-marker-input").value = marker.title;
}

//Removes the center control for renaming markers
function cancelRenameMarker() {
	renameDiv.style.display = "none";
}

//Removes the center control for renaming markers and renames the marker
//stored in the currentMarker variable. See the placeMarker function to learn how
//the value of currentMarker is tracked.
function submitRenameMarker() {
	renameDiv.style.display = "none";
	renameMarker(currentMarker, document.getElementById("rename-marker-input").value);
}

//INFO MENUS
//******************************

//hides both the Help iInfo menu (opened by clicking the top right map control)
//and the Places info menu (opened by right clicking a marker and selecting "Analyze
//Surrounding Area"--this is where the Wikipedia and Google Maps APIs are used)
function hideAllInfoMenus() {
	$(".infoMenu").hide();
}

//shows the help info menu
function showHelpInfoMenu() {
	$("#help-menu").show();
}

//hides the help info menu
function hideHelpInfoMenu() {
	$("#help-menu").hide();
}

//Takes a marker. Renders the marker info menu for that marker
//A marker info menu contains a Google Streetview image of the area around the marker
//as well as a list of significant places (as deamed by the Google Maps API) within
//1 kilometer of the marker's location. For each place, a google search link and at most
//10 wikipedia links are provided. See the placeMarker function to learn how a user
//accesses a marker's info menu.
function renderMarkerInfoMenu(marker) {
	$("#marker-info-menu").html("");
	var lat = marker.position.lat();
	var lng = marker.position.lng();
	var request = {
		location: marker.getPosition(),
		radius: PLACES_SEARCH_RADIUS
	};
	var places;
	var markerInfoMenu = $("#marker-info-menu");
	//searches for nearby places, puts them in "results", and then calls the callback
	placesService.nearbySearch(request, function(results, status) {
		//if no nearby places, make sure results array exists and is empty
		places = status == google.maps.places.PlacesServiceStatus.OK ? results : [];
		markerInfoMenu.append(markerInfoTemp({
			//lat and lng of marker, used for the Google Streetview image
			lat: lat,
			lng: lng,
			places: places
		}));
		//adds the wikipedia links for each of the places
		$(".placesLinksMenu").each(function(index, element) {
			//The below function is not referenced in the above template because
			//the render function  calls an asynchronous function that would need to
			//cause the render function to return if I had done so.
			renderLinksFor(places[index].name, element);
			$(".placeBtn:eq("+index+")").click(function() {
				var divStyle = element.style;
				divStyle.display = divStyle.display == "block" ? "none" : "block";
			});			
		});
		markerInfoMenu.show();
	});
}

//Takes the name of a real world place an HTML element (likely a DIV)
//Renders at most 10 wikipedia links followed by (always) 1 google search link
//for the place. If the wikipedia links don't come after a few seconds, text is inserted
//in place of the links informing the user that no links could be found. This doesn't
//need to be done for the google search link because google searches always take the 
//user to a webpage. Once in a great while, that page will have no results, but that page
//will handle informing the user in this case.
function renderLinksFor(place, element) {
	var wikiApiUrl = 'https://en.wikipedia.org/w/api.php?action=opensearch&search='+place+'&format=json&callback=?';
	var pageNames;
	var name;
	var htmlArray = [];
	
	var wikiTimeout = setTimeout(function(){
		element.innerHTML = "Failed to get wikipedia resources.";
	},8000);
	
	$.ajax( wikiApiUrl, {
		dataType: 'jsonp',
		success: function(data) {
			pageNames = data[1];
			
			if (pageNames.length == 0) {
				htmlArray.push("No related Wikipedia links available");
			} else {
				for (var j = 0; j < pageNames.length; j++) {
					name = pageNames[j];
					url = "https://en.wikipedia.org/wiki/" + name;
					htmlArray.push('<div><a href="'+url+'" target="_blank">'+name+'</a> (Attribution: '+url+')</div>');
				}
			}
			//Google search link
			htmlArray.push('<div>Google Search: <a href="https://www.google.com/search?q='+place+'" target="_blank">'+place+'</a></div>');
			//insert links and stop timeout error message
			element.innerHTML = htmlArray.join("");
			clearTimeout(wikiTimeout);
		}
	});
}

//CONTEXT MENU
//******************************

//if user right clicks anywhere on the google map, save the pixel coordinates of the
//click in global variables. This information is tracked separately from the context
//menu creation function because that function is initiated by a google maps event, which
//does not (as far as I can tell) keep track of the screen coordinates of the click
//(only the geographical map coordinates)
mapDiv.addEventListener("mousedown", function(event) {
	//if right click
	if (event.button == 2) {
		pixelCoordX = event.clientX;
		pixelCoordY = event.clientY;
	}
}, true);

//Remove the currently displayed context menu from the screen
function removeCurrentMenu() {
	if (currentMenu) {
		document.body.removeChild(currentMenu);
		currentMenu = undefined;
	}
}

//Takes a google maps LatLng location as well as any number of objects that have
//a name field and an eventFunction field. These objects are stored in the items parameter.
//Creates a context menu with screen coordinates of pixelCoordX and pixelCoordY (just
//explained above). Creates a button in the menu for each item in the items parameter.
//The name and eventFunction fields are used for the button text and onclick function
//respectively. The event function's data context is bound to the item.
function createContextMenu(location, ...items) {
	removeCurrentMenu();
	$("body").append(listTemp({
		attrSettings: {
			id: CTXT_MENU_ID,
			outerClass: "contextMenu",
			outerStyle: ["left: ", pixelCoordX, "px; top: ", pixelCoordY, "px;"].join("")
		},
		items: items,
		innerTemplate: ctxtBtnTemp
	}));
	currentMenu = document.getElementById(CTXT_MENU_ID);
	var buttons = currentMenu.children;
	_.each(items, function (item, index) {
		item.location = location;
		buttons[index].addEventListener("click", item.eventFunction.bind(item));
	});
}