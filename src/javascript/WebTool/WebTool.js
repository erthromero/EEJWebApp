/////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////
// Code for NASA EEJ Web App                               //
// Authors: (1) Eric Romero, PhD Student, UC Berkeley      //
//          (2) Julia Greenberg                            //
// Date: Aug. 29th 2023                                    //
/////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////

// Initialize color palettes
var palettes = require('users/gena/packages:palettes');

var YrIntervalList = ['1990', '1991', '1992', '1993', '1994', '1995', '1996', '1997', '1998', '1999', '2000','2001', '2002', '2003', '2004', '2005', '2006', '2007', '2008', '2009', '2010', '2011', '2012', '2013', '2014','2015', '2016', '2017', '2018', '2019'];
//var YrIntervalList = [ '1991', '1994', '1997', '2000', '2003', '2006', '2009', '2012','2015', '2018']; // uncomment if working at 3yr time intervals

// Function that renames the bands in an image based on our time series intervals
function renameBandsByYr(image, YrList){
  return(image.rename(YrList));
}

// Function to convert multi-band image to time series image collection (each band prepresents sampling interval of data)
function TSImagetoImageCollection(image){
  
  var bands = image.bandNames();
  var list = bands.map(function(n) { return image.select([n]) });
  var collection = ee.ImageCollection.fromImages(list);
  
  return(collection);
  
}

// Function that returns band name as image property called "year"
function returnYrProp(image){
  
  var Yr = ee.Number(image.bandNames().get(0));
  var tmp_im = image.setMulti({'year': Yr});
  return(tmp_im);
}

// Function that renames the bands in an imageCollection to something universal like b1 (fixes chart legend bug)
function renameBandsUniversal(image){
  
  return(image.rename("b1"));
  
}

// Define base map style.
var basemapStyle = [
    {
        "featureType": "water",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#85adfd"
            },
            {
                "lightness": 17
            }
        ]
    },
    {
        "featureType": "landscape",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#f5f5f5"
            },
            {
                "lightness": 20
            }
        ]
    },
    {
        "featureType": "road.highway",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#ffffff"
            },
            {
                "lightness": 17
            }
        ]
    },
    {
        "featureType": "road.highway",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#ffffff"
            },
            {
                "lightness": 29
            },
            {
                "weight": 0.2
            }
        ]
    },
    {
        "featureType": "road.arterial",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#ffffff"
            },
            {
                "lightness": 18
            }
        ]
    },
    {
        "featureType": "road.local",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#ffffff"
            },
            {
                "lightness": 16
            }
        ]
    },
    {
        "featureType": "poi",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#f5f5f5"
            },
            {
                "lightness": 21
            }
        ]
    },
    {
        "featureType": "poi.park",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#dedede"
            },
            {
                "lightness": 21
            }
        ]
    },
    {
        "elementType": "labels.text.stroke",
        "stylers": [
            {
                "visibility": "on"
            },
            {
                "color": "#ffffff"
            },
            {
                "lightness": 16
            }
        ]
    },
    {
        "elementType": "labels.text.fill",
        "stylers": [
            {
                "saturation": 36
            },
            {
                "color": "#333333"
            },
            {
                "lightness": 40
            }
        ]
    },
    {
        "elementType": "labels.icon",
        "stylers": [
            {
                "visibility": "off"
            }
        ]
    },
    {
        "featureType": "transit",
        "elementType": "geometry",
        "stylers": [
            {
                "color": "#f2f2f2"
            },
            {
                "lightness": 19
            }
        ]
    },
    {
        "featureType": "administrative",
        "elementType": "geometry.fill",
        "stylers": [
            {
                "color": "#fefefe"
            },
            {
                "lightness": 20
            }
        ]
    },
    {
        "featureType": "administrative",
        "elementType": "geometry.stroke",
        "stylers": [
            {
                "color": "#3c3c49"
            },
            {
                "lightness": 10
            },
            {
                "weight": 1.2
            }
        ]
    }
];


// Clear existing map.
ui.root.clear();

// Initiate new map object.
var map = ui.Map();

// Add custom map.
ui.root.add(map);

// Set basemap options.
map.setOptions('Base', {
    Base: basemapStyle
});



// Set visibility options to remove geometry creator, map type controller,
// and layer list.
map.setControlVisibility({
    all: false,
    layerList: false,
    zoomControl: true,
    scaleControl: true,
    mapTypeControl: false,
    fullscreenControl: false
});

// Set the default map's cursor to a 'crosshair'.
map.style().set('cursor', 'crosshair');

// Set the center and zoom level of the new map.
map.setCenter(-122.355537, 37.828, 9);

// Create an inspector panel with a horizontal layout.
var inspector = ui.Panel({
    layout: ui.Panel.Layout.flow('vertical'),
});

// Create a widget panel for the display chart
var widget1 = ui.Panel({style: {position: 'bottom-left'}}); 

// Add a label to the panel.
inspector.add(
    ui.Label({
        value: 'Click on a location to see greenness and temperature trends.',
        style: {
            fontSize: '12px', // '1.6vmin',
            fontWeight: 'bold',
            textAlign: 'center',
            margin: '0px 0px 0px 0px'
        },
    })
);


/////////////////////////////////
//Load in all relevant datasets//
/////////////////////////////////

// Vector datasets
var tracts = ee.FeatureCollection('projects/nasa-eej/assets/tract_for_webtool');
var zips = ee.FeatureCollection('projects/nasa-eej/assets/zip_for_webtool');

// Time Series for NDVI and trends stats

// NOTE (Eric): Here we do some manipulation to the raw time series data so that it gets nicely formatted in the side panel
var NDVI1yrTS = ee.Image('projects/nasa-eej/assets/NDVI1yrTimeSeries1990to2020');
var NDVI1yrTS = renameBandsByYr(NDVI1yrTS, YrIntervalList);
var NDVI1yrTS = TSImagetoImageCollection(NDVI1yrTS);
var NDVI1yrTS = NDVI1yrTS.map(returnYrProp);
var NDVI1yrTS = NDVI1yrTS.map(renameBandsUniversal); // remove funky chart legend formatting

var LST1yrTS = ee.Image('projects/nasa-eej/assets/LST1yrTimeSeries1990to2020');
var LST1yrTS = renameBandsByYr(LST1yrTS, YrIntervalList);
var LST1yrTS = TSImagetoImageCollection(LST1yrTS);
var LST1yrTS = LST1yrTS.map(returnYrProp);
var LST1yrTS = LST1yrTS.map(renameBandsUniversal); // remove funky chart legend formatting
var LST1yrTS = LST1yrTS.map(function(img){
  return img.subtract(273.15);
}); 

// convert kelvin to C

// NOTE (Eric): Bring in linear trend rasters 
var NDVI1yrTSTrends = ee.Image('projects/nasa-eej/assets/NDVI1yrTimeSeries1990to2020LinearTrendStats');
var LST1yrTSTrends = ee.Image('projects/nasa-eej/assets/LST1yrTimeSeries1990to2020LinearTrendStats');


//Green space classification raster
var GreenSpaceClassified = ee.Image('projects/nasa-eej/assets/EEJGreenSpaceClassificationR2');

// NDVI color palette
var NDVIpal = palettes.colorbrewer.RdYlGn[11];
var LSTpal = palettes.niccoli.linearlhot[7].reverse();

// Green space classification color palette
var Classpal = ['#008000', '#1e90ff', '#778899'];

// Define information about each layer that will be used to visualize it and
// describe it in a selector widget and legend.

var color_dict = ee.Dictionary({
              '1_3': {fillColor: '#f73593CC'},
              '2_3': {fillColor: '#a53593CC'},
              '3_3': {fillColor: '#403593CC'},
              '1_2': {fillColor: '#f78fb6CC'},
              '2_2': {fillColor: '#a58fb6CC'},
              '3_2': {fillColor: '#408fa7CC'},
              '1_1': {fillColor: '#f7fcf5CC'},
              '2_1': {fillColor: '#a5e8cdCC'},
              '3_1': {fillColor: '#40dba7CC'},
              '1_NA': {fillColor: '#FFFFFF77'},
              '2_NA': {fillColor: '#FFFFFF77'},
              '3_NA': {fillColor: '#FFFFFF77'}
              });
              
var color_pal = {palette: ['#f73593CC', '#a53593CC', '#403593CC', '#f78fb6CC', '#a58fb6CC', '#408fa7CC', '#f7fcf5CC', '#a5e8cdCC', '#40dba7CC', '#FFFFFF77', '#FFFFFF77', '#FFFFFF77']}

var dataInfo = {
  
    'vgt': {
        name: "Trend in 'degree of greenness'",
        desc: 'Statistic describing an increasing or decreasing trend '+
        ' in greenness defined using the normalized difference vegetation index (NDVI; source: Landsat)'+
        ' between 1990 and 2020. NDVI is a unitless measure of vegetation health between -1 and 1.',
        img: NDVI1yrTSTrends.select('b3'),
        type: 'image_cont',
        vis: {
            min: -0.01,
            max: 0.01,
            palette: NDVIpal,
            opacity: 0.7
        }
    },
    'lstt': {
        name: 'Land surface temperature trend',
        desc: 'Statistic describing an increasing or decreasing ' +
         'trend in land surface temperature (LST; source: Landsat) between 1990 and 2020. ' +
         'LST is measured in °C.',
        img: LST1yrTSTrends.select('b3'),
        type: 'image_cont',
        vis: {
            min: -0.05,
            max: 0.5,
            palette: LSTpal,
            opacity: 0.7
        }
    },
    'cls': {
        name: 'Green space classification',
        desc: 'Areas classified as green space, water, or urban areas in 2020 using machine learning.',
        img: GreenSpaceClassified,
        type: 'image_class',
        vis: {
            min: 1,
            max: 3,
            labels: ['Green space', 'Water', 'Urban/Impervious'],
            palette: Classpal,
            opacity: 0.7
        }
    },
    'ndvi_dr': {
      name: 'Degree of greenness & displacement risk',
      desc: 'Degree of greenness compared to level of displacement risk in 2019 ' +
        '(from Estimated Displacement Risk model) at the census tract level. Degree of ' +
        'greenness is defined using the median normalized difference vegetation index (NDVI; source: Landsat). ' +
        'NDVI is a unitless measure of vegetation health between -1 and 1.',
      img: tracts,
      type: 'vec',
      style: color_dict,
      vis: color_pal
    },  
    'ndvi_sc': {
      name: 'Degree of greenness & social vulnerability',
      desc: "Degree of greenness (2019) compared to CDC's 2018 Social " +
        'Vulnerability Index at the census tract level. Degree of greenness is defined using the median ' +
        'normalized difference vegetation index (NDVI; source: Landsat). NDVI is a unitless measure of ' +
        'vegetation health between -1 and 1.',
      img: tracts,
      type: 'vec',
      style: color_dict,
      vis: color_pal
    },
   'ndvi_pricechange': {
      name: 'Degree of greenness trend & housing price trend',
      desc: 'Rate of change in greenness (1990 - 2019) & percent change in yearly average ' +
        'housing price (2000 - 2020) at the zip code level. Degree of greenness is defined using the ' +
        'median normalized difference vegetation index (NDVI; source: Landsat). '+
        'NDVI is a unitless measure of vegetation health between -1 and 1. Only zip codes with statistically ' +
        'significant (p < 0.05) greenness trends are shown.',
      img: zips,
      type: 'vec',
      style: color_dict,
      vis: color_pal
    },
   'lst_dr': {
      name: 'Land surface temperature & displacement risk',
      desc: 'Median land surface temperature (LST; source: Landsat) compared to displacement ' +
        'risk in 2019 (from Estimated Displacement Risk model) at the census tract level.',
      img: tracts,
      type: 'vec',
      style: color_dict,
      vis: color_pal
    },  
   'lst_soc': {
      name: 'Land surface temperature & social vulnerability',
      desc: "Median land surface temperature (LST; source: Landsat) in 2019 compared to CDC's 2018 Social " +
        'Vulnerability Index at the census tract level.',
      img: tracts,
      type: 'vec',
      style: color_dict,
      vis: color_pal
    },
   'lst_pricechange': {
      name: 'Land surface temperature trend & housing price trend',
      desc: 'Rate of change in land surface temperature (LST; source: Landsat) from 1990 to 2019 compared to percent change ' +
        'in yearly average housing price from 2000 to 2020 at the zip code level. Only zip codes with statistically ' +
        'significant (p < 0.05) land surface temperature trends are shown.',
      img: zips,
      type: 'vec',
      style: color_dict,
      vis: color_pal
    },
   'pctgreen_dr': {
      name: 'Percent classified green space & displacement risk',
      desc: 'Share of tract that is classified as green space compared to displacement ' +
      'risk in 2019 (from Estimated Displacement Risk model) at the census tract level.',
      img: tracts,
      type: 'vec',
      style: color_dict,
      vis: color_pal
    },  
   'pctgreen_soc': {
      name: 'Percent classified green space & social vulnerability',
      desc: "Share of tract that is classified as green space in 2019 compared to CDC's 2018 Social " +
        "Vulnerability Index at the census tract level.",
      img: tracts,
      type: 'vec',
      style: color_dict,
      vis: color_pal
    }
};

// Register a callback on the default map to be invoked when the map is clicked.
var ImClick =  function(coords) {
    // Clear the main panel.
    widget1.clear();

    // Call the panel creation function again.
    // panelcreate();

    // Call the reference panel creation function again.
    // referencecreate();

    // Create panels to hold lon/lat and UHI values.
    var gap = ui.Label(' ');
    gap.style().set({fontSize: '13px'})
    var lat = ui.Label();
    lat.style().set({fontSize: '13px'})
    var lon = ui.Label();
    lon.style().set({fontSize: '13px'})
    var Value = ui.Label();
    Value.style().set({fontSize: '13px'})
    var ndviSlopePix = ui.Label();
    ndviSlopePix.style().set({fontSize: '13px'})
    var ndviIntPix = ui.Label();
    ndviIntPix.style().set({fontSize: '13px'})
    var ndviPvalPix = ui.Label();
    ndviPvalPix.style().set({fontSize: '13px'})

    // Add a red dot showing the point clicked on.
    var point = ee.Geometry.Point(coords.lon, coords.lat);
    var dot = ui.Map.Layer(point, {
        color: 'red'
    });
    map.layers().set(1, dot);

    // Clear the inspector panel.
    inspector.clear();

    // Show the inspector panel and add a loading label.
    inspector.style().set('shown', true);
    inspector.add(
        ui.Label({
            value: 'Loading...',
            style: {
                color: 'gray',
                fontSize: '12px', // '1.7vmin',
                fontWeight: 'normal',
                textAlign: 'center',
                margin: '0px 0px 0px 0px'
            },
        })
    );

    // Sample data at the clicked point from the images.
    function getVal(img, point, scale, key, places) {
        var info = ee.Image(img).sample(point, scale).first().getInfo();
        //print(info);
        var formattedValue;
        if (info) {
            formattedValue = info.properties[key].toFixed(places);
        } else {
            formattedValue = 'NoData';
        }
        return formattedValue;
    }
    var sampleNDVIslope = getVal(NDVI1yrTSTrends.select('b3'), point, 30, 'b3', 5);
    var sampleLSTslope = getVal(LST1yrTSTrends.select('b3'), point, 120, 'b3', 5);
    var sampleClass = getVal(GreenSpaceClassified, point, 5, 'b1', 5);
    
    if (sampleClass == 1){
      var classDisplay = 'Green space';
      
    } else if (sampleClass == 2){
      var classDisplay = 'Water';
    
      
    } else if (sampleClass == 3){
      var classDisplay = 'Urban/Impervious';
    }else{
      var classDisplay = 'None'
    }

    // Update the lon/lat panel with values from the click event.
    lat.setValue('Lat: ' + coords.lat.toFixed(2));
    lon.setValue('Lon: ' + coords.lon.toFixed(2));

    // Update the panels with their respective values.
    ndviSlopePix.setValue('NDVI (greenness) trend: ' + sampleNDVIslope);
    ndviIntPix.setValue('LST (temperature) trend: ' + sampleLSTslope);
    ndviPvalPix.setValue('2020 classification: ' + classDisplay);
    var merged = NDVI1yrTS.toList(29).zip(LST1yrTS.toList(29))
    .map(function(row) {
        return ee.Image(ee.List(row).get(0))
              .addBands(ee.List(row).get(1));
    });

    // Create an NDVI-LSTChart line chart.
    // Create a line chart from the NDVI time series and point data.
    if (NDVI1yrTS != 'NoData' && LST1yrTS != 'NoData') {
        var NDVILSTChart = ui.Chart.image
            .series(
              {'imageCollection':merged,
                'region': point ,
                'xProperty': 'year'
              })
            .setSeriesNames(['NDVI', 'LST'])
            // Set the chart type to be a line chart.
            .setChartType('LineChart');
        NDVILSTChart.setOptions({
            // Set the title of the chart.
            title: 'Degree of greenness & land surface temperature',
            series: {
                 0: {
                     targetAxisIndex: 0 ,
                     type: "line" ,
                     lineWidth: 3 ,
                     pointSize: 5 ,
                     color: '#32cd32'
                    } ,
                 1: {
                     targetAxisIndex: 1 ,
                     type: "line" ,
                     lineWidth: 3 ,
                     pointSize: 5 ,
                     color: '#bd0026' 
                    } ,
                } ,
            vAxes: {
                0: {
                    // Set primary (left) y-axis
                    targetAxisIndex: 0,
                    //baseline: 0,
                    ticks: [-1,-0.5,0,0.5,1],
                    // Set the title of the vertical axis.
                    title: 'NDVI',
                    // Set the format of the numbers on the axis.
                    format: '#.##',
                    gridlines: {count: 3},
                    // Set the style of the text.
                    titleTextStyle: {
                        bold: true,
                        color: '#32cd32',
                        italic: false
                    },
                    viewWindow: { min: -1 }
                },
                1:{
                  // Set seconday (right) y-axis
                    targetAxisIndex: 1,
                    //baseline: 0,
                    ticks: [0,10,20,30,40],
                    // Set the title of the vertical axis.
                    title: 'LST (°C)',
                    // Set the format of the numbers on the axis.
                    format: '##',
                    //gridlines: {count: 3},
                    // Set the style of the text.
                    titleTextStyle: {
                        bold: true,
                        color: '#bd0026',
                        italic: false
                    },
                    viewWindow: { min: -1 }
                  
                },
            },
            hAxis: {
                // Set the title of the horizontal axis.
                title: 'Year',
                // Set the format of the numbers on the axis.
                format: 'yyyy',
                // Set the number of gridlines on the axis.
                //gridlines: {count: 5},
                showTextEvery: 10,
                // Set the style of the text.
                titleTextStyle: {
                    bold: true,
                    italic: false
                },
            },
            // Set the type of curve for the line chart.
            curveType: 'function',
            // Set the color of the line.
            colors: ['#32cd32', '#bd0026'],
            // Set the width of the line.
            lineWidth: 3,
            // Set the size of the points on the line chart.
            pointSize: 5,
            // Set the height of the chart area.
            // width: 600,
            height: 200,
            tooltip: {
                trigger: 'none'
            }
        });

        // Add the chart to the panel.
        widget1.clear();
        widget1.style().set({position: 'bottom-left', width: '400px'});
        widget1.add(NDVILSTChart);
        
        // Add panels to show longitude, latitude, and pixel values to the main panel.
        widget1.add(ui.Panel([gap], ui.Panel.Layout.flow('horizontal')));
        widget1.add(ui.Panel([lat, lon], ui.Panel.Layout.flow('horizontal')));
        widget1.add(ui.Panel([ndviSlopePix], ui.Panel.Layout.flow('horizontal')));
        widget1.add(ui.Panel([ndviIntPix], ui.Panel.Layout.flow('horizontal')));
        widget1.add(ui.Panel([ndviPvalPix], ui.Panel.Layout.flow('horizontal')));
        
        // Create a close button
        var closeButton = ui.Button({
          label: 'Close',
          onClick: function() {
            // Remove the chart panel when the close button is clicked
            widget1.clear();
            widget1.style().set({width: '1px'});
          }
        });
        
        // Create a panel to hold the close button
        var buttonPanel = ui.Panel({
          widgets: [closeButton],
          style: {
            position: 'bottom-right',
            padding: '1px 1px 1px 300px' 
          }
        });
  
        // Add the close button to the chart panel
        widget1.add(buttonPanel);
        
    } else {
        
        // Add a blank label widget if there is no data.
        map.widgets().set(10, ui.Label());
        
        // Create a close button
        var closeButton = ui.Button({
          label: 'Close',
          onClick: function() {
            // Remove the chart panel when the close button is clicked
            widget1.clear();
            widget1.style().set({width: '1px'});
          }
        });
        
        // Create a panel to hold the close button
        var buttonPanel = ui.Panel({
          widgets: [closeButton],
          style: {
            position: 'bottom-right',
            padding: '1px 1px 1px 300px' 
          }
        });
  
        // Add the close button to the chart panel
        widget1.add(buttonPanel);
        
        
    }

    // Clear inspector again and display a new label.
    inspector.clear();

    inspector.style().set('shown', true);
    inspector.add(
        // Set the label text.
        ui.Label({
            value: 'Click on another location...',
            style: {
                fontSize: '16px', // '1.7vmin',
                fontWeight: 'bold',
                textAlign: 'center',
                margin: '0px 0px 0px 0px'
            },
        })
    );
};

var legend = ui.Panel({
    style: {
        width: '30%'
    }
});

// Add the main panel to the UI root.
ui.root.insert(1, legend);

// Create a layer selector that dictates which layer is visible on the map.
// The list of possible layers are generated from the data info provided above.
var items = [];
Object.keys(dataInfo).forEach(function(key) {
    items.push({value: key, label: dataInfo[key].name});
});
items.push({value: 'none', label: 'Remove all'});

var select = ui.Select({
    items: items,
    value: items[0].value,
    style: { margin: '20px 20px' }
});

// Redraw function is called when the user changes the selected layer.
function redraw(layer) {
    // Fetch the info that corresponds to the selected layer.
    var info = dataInfo[layer];

    // Reset the layers and the legend.
    map.layers().reset();
    legend.clear();

    // Construct the layer selection widgets.
    legend
    .add(
        ui.Label({
            value: 'Where the Grass Grows Greener: The Impacts of ' +
            'Urban Greening on Housing Prices and Neighborhood Stability',
            style: {
                fontSize: '14px', // '1vw',
                fontWeight: 'bold',
                backgroundColor: '#ddebe4',
                padding: '5px 5px 5px 5px',
                textAlign: 'center',
                margin: '10px 20px 10px 20px'
            },
        })
    )
    .add(
        ui.Label({
            value: 'This webtool shows trends in urban greenery and land ' +
            'surface temperature in the San Francisco Bay Area between 1990 ' +
            'and 2020. It also illustrates spatial relationships with ' +
            'socioeconomic indicators such as housing prices and displacement risk. ' +
            "Note that the vector layers include only census tracts or zip codes " +
            "that are located in areas designated as 'urban'."
            ,
            style: {
                fontSize: '13px', // '.9vw',
                fontWeight: 'normal',
                margin: '10px 20px 10px 20px'
            },
        })
    )
    .add(
        ui.Label({
            value: 'Click here to read more about the data and our methodology.',
            // Methodology doc: https://docs.google.com/document/d/1z7E5YeSs4yCnBf2y1_TTxLfbIHANdyLbcvNwNI6V3WA/edit
            style: {
                color: 'black',
                fontSize: '12px', // '.9vw',
                fontWeight: 'bold',
                textAlign: 'left',
                margin: '10px 20px 2px 20px'
            },
            targetUrl: 'https://github.com/erthromero/EEJWebApp'
        })
    )
    .add(
        ui.Label({
            value: 'Created by Eric Romero and Julia Greenberg',
            style: {
                color: 'black',
                fontSize: '12px', // '.8vw',
                fontWeight: 'bold',
                textAlign: 'left',
                margin: '10px 20px 2px 20px'
            }
        })
    )
    .add(
        ui.Label({
            value: 'Funding from the NASA Equity and Environmental Justice program, Data Integration Project, grant no. 80NSSC22K1699',
            style: {
                color: 'black',
                fontSize: '12px', // '.8vw',
                textAlign: 'left',
                margin: '10px 20px 10px 20px'
            },
        }) 
    )
    .add(
      ui.Panel({
        style: {
          backgroundColor: 'gray', // Color of the line
          height: '2px',            // Height of the line
          margin: '8px 20px 8px 20px'     // Margin for spacing
        }
      })
    )
    .add(
        ui.Label({
            value: 'Choose display layer:',
            style: {
                fontSize: '13px',
                fontWeight: 'bold',
                textAlign: 'left',
                margin: '10px 20px 0px 20px'
            },
        })       
    )
    .add(select);

    // Construct the legend widgets for continuous image.
    function makeLegendImgCont(vis) {
        // Creates a color bar thumbnail image for use in legend from the given
        // color palette.
        function makeColorBarParams(palette) {
            return {
            // Bounding box for color bar.
                bbox: [0, 0, 1, 0.1],
                // Dimensions of color bar.
                dimensions: '100x10',
                // Format of color bar.
                format: 'png',
                // Min value for color bar.
                min: 0,
                // Max value for color bar.
                max: 1,
                // Color palette for color bar.
                palette: palette
            };
        }

        // Create the color bar for the legend.
        var colorBar = ui.Thumbnail({
        // Image to use for color bar.
            image: ee.Image.pixelLonLat().select(0),
            // Parameters for color bar.
            params: makeColorBarParams(vis.palette),
            style: {
                // Stretch color bar horizontally.
                stretch: 'horizontal',
                // Margin of color bar.
                margin: '0px 20px 0px 20px',
                // Max height of color bar.
                maxHeight: '10%',
                // Width of color bar.
                width: '91%'
            },
        });

        // Create a panel with two numbers for the legend.
        var legendLabels = ui.Panel({
            widgets: [
                ui.Label(vis.min, {
                    margin: '8px 20px 8px 20px'
                }),
                ui.Label('', {
                    margin: '8px 20px 8px 20px',
                    textAlign: 'center',
                    stretch: 'horizontal'
                }),
                ui.Label(vis.max, {
                    margin: '8px 20px 8px 20px'
                }),
            ],
            layout: ui.Panel.Layout.flow('horizontal')
        });

        // Add label to legend.
        legend.add(
            ui.Label({
                value: info.desc,
                style: {
                    fontSize: '13px',
                    textAlign: 'left',
                    // padding: '0px 8px 4px 8px'
                    margin: '0px 20px 20px 20px'
                },
            })
        );

        // Add colorbar to legend.
        legend.add(colorBar);

        // Add labels to legend.
        legend.add(legendLabels);
    }
    
    // Construct the legend widgets for classified vector.
    function makeLegendImgClass(vis) {
        // Creates a color bar thumbnail image for use in legend from the given
        // color palette.
        // Creates and styles 1 row of the legend.
      function makeRow(color, name) {
   
        // Create the label that is actually the colored box.
        var colorBox = ui.Label({
          style: {
            backgroundColor: color,
            // Use padding to give the box height and width.
            padding: '8px',
            margin: '0px 10px 10px 20px'
          }
        });
   
        // Create the label filled with the description text.
        var description = ui.Label({
          value: name,
          style: {margin: '0px 10px 10px 20px'}
        });
 
      // return the panel
      return ui.Panel({
        widgets: [colorBox, description],
        layout: ui.Panel.Layout.Flow('horizontal')
        });
      }
    
    legend.add(
            ui.Label({
                value: info.desc,
                style: {
                    fontSize: '13px',
                    textAlign: 'left',
                    margin: '0px 20px 20px 20px'
                },
            })
        );
    
    // Add color and and names
    for (var i = 0; i < 3; i++) {
      legend.add(makeRow(vis.palette[i], vis.labels[i]));
      }
      
    }
    
    // Construct the legend widgets for classified vector.
    function makeLegendVec(vis) {
      
      var legendItems = [
        { color: '#f73593'},//, label: 'Low - High' },
        { color: '#a53593'},//, label: 'Medium - High' },
        { color: '#403593'},//, label: 'High - High' },
        { color: '#f78fb6'},//, label: 'Low - Medium' },
        { color: '#a58fb6'},//, label: 'Medium - Medium' },
        { color: '#408fa7'},//, label: 'High - Medium' },  
        { color: '#f7fcf5'},//, label: 'Low - Low' },  
        { color: '#a5e8cd'},//, label: 'Medium - Low' },
        { color: '#40dba7'}//, label: 'High - Low' }
      ];      
      
      // Create a custom legend panel with a square arrangement
      var legendPanel = ui.Panel();
      
      for (var i = 0; i < 3; i++) {
        var rowPanel = ui.Panel({
          layout: ui.Panel.Layout.Flow('horizontal'),
          style: { margin: '0px 0px 0px 0px' }
        });
        for (var j = 0; j < 3; j++) {
          var index = i * 3 + j;
          if (index < legendItems.length) {
            var item = legendItems[index];
            var colorBlock = ui.Panel({
              style: {
                backgroundColor: item.color,
                width: '20px',
                height: '20px',
                margin: '0' // No margin between columns
              },
            });
            var legendItemPanel = ui.Panel({
              widgets: [colorBlock],
              layout: ui.Panel.Layout.Flow('horizontal'), // Horizontal layout
            });
            rowPanel.add(legendItemPanel);
          }
        }
        legendPanel.add(rowPanel);
      }   
    
    if (layer == 'ndvi_dr') {
      var lab1 = 'Degree of\n     greenness'
      var lab2 = 'Displacement\n   risk' 
      var threshold = 'Degree of greenness:\n17.78 °C, 34.5 °C, 37.17 °C, 43.47 °C\n\nDisplacement risk:\nsee methodology'
      
    } else if (layer == 'ndvi_sc') {
        var lab1 = 'Degree of\n     greenness'
        var lab2 = 'Social\n   vulnerability' 
        var threshold = 'Degree of greenness:\n17.78 °C, 34.5 °C, 37.17 °C, 43.47 °C\n\nSocial Vulnerability Index:\n0, 0.21, 0.48, 1'
    
    } else if (layer == 'lst_dr') {
        var lab1 = 'Land surface\n     temperature'
        var lab2 = 'Displacement\n   risk'  
        var threshold = 'Land surface temperature:\n17.78 °C, 34.5 °C, 37.17 °C, 43.47 °C\n\nDisplacement risk:\nsee methodology'
    
    } else if (layer == 'lst_soc') {
        var lab1 = 'Land surface\n     temperature'
        var lab2 = 'Social\n   vulnerability'
        var threshold = 'Land surface temperature:\n17.78 °C, 34.5 °C, 37.17 °C, 43.47 °C\n\nSocial Vulnerability Index:\n0, 0.21, 0.48, 1'
    
    } else if (layer == 'pctgreen_dr') {
        var lab1 = 'Percent\n     green space'
        var lab2 = 'Displacement\n   risk'    
        var threshold = 'Percent green space:\n0%, 11%, 33%, 98%\n\nDisplacement risk:\nsee methodology'
        
    } else if (layer == 'pctgreen_soc') {
        var lab1 = 'Percent\n     green space'
        var lab2 = 'Social\n   vulnerability'
        var threshold = 'Percent green space:\n0%, 11%, 33%, 98%\n\nSocial Vulnerability Index:\n0, 0.21, 0.48, 1'
        
    } else if (layer == 'ndvi_pricechange') {
        var lab1 = 'Degree of greenness\n     increase'
        var lab2 = 'Housing price\n   increase'
        var threshold = 'Degree of greenness increase:\n0.0004, 0.0018, 0.0027, 0.0076\n\nHousing price increase:\n89%, 143%, 177%, 506%'
        
    } else if (layer == 'lst_pricechange') {
        var lab1 = 'Land surface\n     temperature\n     increase'
        var lab2 = 'Housing price\n   increase'
        var threshold = 'Land surface temperature increase:\n0.11, 0.26, 0.32, 0.47\n\nHousing price increase:\n89%, 143%, 177%, 506%'
        
    }
    
    // Create labels
    var Label1 = ui.Label('\u2192 ' + lab1, {whiteSpace: 'pre', fontSize: '13px'});
    var Label2 = ui.Label('\u2191 ' + lab2, {whiteSpace: 'pre', fontSize: '13px'});
    
    var Threshold_title = ui.Label({
      value: 'Bin thresholds', 
      style: {fontWeight: 'bold', fontSize: '12px', backgroundColor: '#ddebe4'}});
      
    var Threshold = ui.Label({
      value: threshold, 
      style: {fontSize: '12px', whiteSpace: 'pre-wrap', backgroundColor: '#ddebe4'}});
    
    // Create a panel to contain the legend square and labels
    
    var containerPanel1 = ui.Panel({
      widgets: [legendPanel, Label2],
      layout: ui.Panel.Layout.Flow('horizontal')
    });
    
    var containerPanel2 = ui.Panel({
      widgets: [containerPanel1, Label1],
      layout: ui.Panel.Layout.Flow('vertical'),
      style: {margin: '0px 20px 0px 20px'}
    });   
    
    var Both_Threshold = ui.Panel({
      widgets: [Threshold_title, Threshold],
      layout: ui.Panel.Layout.Flow('vertical'),
      style: {backgroundColor: '#ddebe4', margin: '0px 8px 15px 8px'}
    });   
    
    var containerPanel3 = ui.Panel({
      widgets: [containerPanel2, Both_Threshold],
      layout: ui.Panel.Layout.Flow('horizontal')
    });        
    
    // Add label to legend.
    legend.add(
      ui.Label({
        value: info.desc,
        style: {
          fontSize: '13px',
          textAlign: 'left',
          // padding: '0px 0px 4px 0px',
          margin: '0px 20px 20px 20px'
        }
      })
    );    
    
    legend.add(containerPanel3)
    }
      

    // If layer is none, reset layers on map.
    if (layer == 'none') {
        map.layers().reset();
        
    } else {
        // Check which layer is selected and create the corresponding legend.
      
        // Add layer to map.
        if (info.type == 'image_cont'){
          
          // Add the inspector panel to the default map.
          map.remove(inspector);
          map.remove(widget1);
          map.add(inspector);
          map.add(widget1);
          map.onClick(ImClick);
          
          makeLegendImgCont(info.vis);
          var visImg = info.img.visualize(info.vis);
          map.addLayer(visImg, {}, layer);
        }
        
        if (info.type == 'image_class'){
          
          // Add the inspector panel to the default map.
          map.remove(inspector);
          map.remove(widget1);
          map.add(inspector);
          map.add(widget1);
          map.onClick(ImClick);
          
          makeLegendImgClass(info.vis);
          var visImg = info.img.visualize({min: info.vis.min,
                                            max: info.vis.max,
                                            opacity: info.vis.opacity,
                                            palette: info.vis.palette});
          map.addLayer(visImg, {}, layer);
        }
        
        if (info.type == 'vec'){
          
          map.remove(inspector)
          map.remove(widget1)
          map.unlisten()
          
          makeLegendVec(info.vis);
          var visImg = info.img;
          
          if (layer == 'ndvi_dr') {
            
            var visImg = visImg.map(function(feature){
              return feature.set('style', info.style.get(feature.get('ne')))
            });      
          
          } else if (layer == 'ndvi_sc') {
            var visImg = visImg.map(function(feature){
              return feature.set('style', info.style.get(feature.get('ns')))
            });   
            
          } else if (layer == 'lst_dr') {
            var visImg = visImg.map(function(feature){
              return feature.set('style', info.style.get(feature.get('le')))
            });   
            
          } else if (layer == 'lst_soc') {
            var visImg = visImg.map(function(feature){
              return feature.set('style', info.style.get(feature.get('ls')))
            });
          
          } else if (layer == 'pctgreen_dr') {
            var visImg = visImg.map(function(feature){
              return feature.set('style', info.style.get(feature.get('ge')))
            });            
            
          } else if (layer == 'pctgreen_soc') {
            var visImg = visImg.map(function(feature){
              return feature.set('style', info.style.get(feature.get('gs')))
            });   

          } else if (layer == 'ndvi_pricechange') {
            var visImg = visImg.map(function(feature){
              return feature.set('style', info.style.get(feature.get('nsc')))
            }); 
            
          } else if (layer == 'lst_pricechange') {
            var visImg = visImg.map(function(feature){
              return feature.set('style', info.style.get(feature.get('lsc')))
            });             
          }          
          var visImg = visImg.style({
            styleProperty: 'style',
            width: 0
          });
          
          map.addLayer(visImg)
        }
    }
}

// Register the `redraw` function to the layer selector.
select.onChange(redraw);

// Invoke the redraw function at start up to initialize the exceedance map.
redraw('vgt');