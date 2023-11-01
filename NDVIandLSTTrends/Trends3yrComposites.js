var testAOI = ee.FeatureCollection("users/ericromero/eej/vectors/BayAreaBlockGroupsDissolved");

// This code was adapted from methods provided by Iryna Dronova, PhD, to calculate
// temporal trends in NDVI and LST over the greater San Francisco Bay Area
// This code takes median composites at 3-year intervals
// Author: Eric Romero, PhD Student, ESPM UC Berkeley
// Last modified: 06/16/2023

// NOTE (Eric): Landsat 4, 5 & 7 cloud mask function
var cloudMask457_C2 = function(image) {
    var dilatedCloud = (1 << 1);
    var cloud = (1 << 3);
    var cloudShadow = (1 << 4);
    var qa = image.select('QA_PIXEL');
    var mask = qa.bitwiseAnd(dilatedCloud)
      .or(qa.bitwiseAnd(cloud)) //was .and
      .or(qa.bitwiseAnd(cloudShadow));
    return image.updateMask(mask.not());
  };
  
  //NOTE (Eric): Function to rename Landsat 8 bands
  var l8BandRename = function(image){
    return image.rename(['na0', 'SR_B1','SR_B2',
    'SR_B3','SR_B4','SR_B5',
    'SR_B7', 'SR_QA_AEROSOL','ST_B6',
    'na1','na2','na3','na4','na5',
    'na6','na7','na8','QA_PIXEL','QA_RADSAT'])
    .toUint16()};
    
  //NOTE (Eric): Function adding the observation year as a property to 
  // each image
  var addYearProp = function(image) {
    return image.set('year', ee.Image(image).date().get('year'));
    };
    
  // NOTE (Eric): Function that retrieves the last avalible image in a year
  // given a composite of images over a pre-defined set of years
  var LastYr = function(year) {
   var systemTime_start = collection_merge
   .filterMetadata('year', 'equals', year)
   .aggregate_array('system:time_start')
   .sort()
   .get(-1);
   return collection_merge
   // Filter image collection by year.
   .filterMetadata('year', 'equals', year)
   // Reduce image collection by median.
   .reduce(ee.Reducer.median())
   // Set composite year as an image property.
   .set('system:time_start', systemTime_start)
   .set('year',  year);
  };
  
  // NOTE (Eric): Function that collects a three-year median based on the beginning
  // and end of image collection slice
  var n = 3;
  var Slicer = function(ele){
    
    // NOTE (Eric): Establish the start and end of the slice
    var start = ee.Number(ele).int(); 
    var end = ee.Number(ele).add(n).int(); 
    
    // NOTE (Eric): Create a new list to fill a three year median
    var new_list = ee.List([]);
    var element = lsCompList.slice(start, end);
    
    // NOTE (Eric): create the three year sliced median and set the correct timestamp
    element = ee.ImageCollection(ee.List(element)).median().set('system:time_start', ee.Image(element.get(-1)).get('system:time_start'));
    
    // NOTE (Eric): Add the element to the list 
    new_list = new_list.add(element);
    
    return new_list;
  };
  
  // NOTE (Eric): Function that applies scaling factors for surface reflectance and thermal LST
  function applyScaleFactors(image) {
    var opticalBands = image.select('SR_B.').multiply(0.0000275).add(-0.2);
    var thermalBand = image.select('ST_B6').multiply(0.00341802).add(149.0);
    return image.addBands(opticalBands, null, true)
                .addBands(thermalBand, null, true);
  }
  
  
  // NOTE (Eric): Function that maps NDVI over image collection
  var addNDVI = function(image){
    var ndvi = image.normalizedDifference(['SR_B4', 'SR_B3']).rename('NDVI');
    return image.addBands(ndvi);
  };
  
  //NOTE (Eric): Function that masks an image given a mask raster
  var maskImage = function(image){
    return image.mask(im_mask);
  };
  
  // NOTE (Eric):Function adding a band that contains
  // image date as years
  function createTimeBand(img) {
    var year = img.date().difference(ee.Date('1985-01-01'), 'year');
    return ee.Image(year).float().addBands(img);
  }
  
  // NOTE (Eric): Functions necessary for performing Mann-Kendall test
  var sign = function(i, j) { // i and j are images
    return ee.Image(j).neq(i) // Zero case
        .multiply(ee.Image(j).subtract(i).clamp(-1, 1)).int();
  };
  
  // Compute tie group sizes in a sequence.  The first group is discarded.
  var group = function(array) {
    var length = array.arrayLength(0);
    // Array of indices.  These are 1-indexed.
    var indices = ee.Image([1])
        .arrayRepeat(0, length)
        .arrayAccum(0, ee.Reducer.sum())
        .toArray(1);
    var sorted = array.arraySort();
    var left = sorted.arraySlice(0, 1);
    var right = sorted.arraySlice(0, 0, -1);
    // Indices of the end of runs.
    var mask = left.neq(right)
    // Always keep the last index, the end of the sequence.
        .arrayCat(ee.Image(ee.Array([[1]])), 0);
    var runIndices = indices.arrayMask(mask);
    // Subtract the indices to get run lengths.
    var groupSizes = runIndices.arraySlice(0, 1)
        .subtract(runIndices.arraySlice(0, 0, -1));
    return groupSizes;
  };
  
  // NOTE (Eric): FUnctions for computing p-values from Mann-Kendall test
  // https://en.wikipedia.org/wiki/Error_function#Cumulative_distribution_function
   var eeCdf =function(z) {
    return ee.Image(0.5)
        .multiply(ee.Image(1).add(ee.Image(z).divide(ee.Image(2).sqrt()).erf()));
  };
  
  var  invCdf = function(p) {
    return ee.Image(2).sqrt()
        .multiply(ee.Image(p).multiply(2).subtract(1).erfInv());
  };
  
  // See equation 2.6 in Sen (1968).
  var factors = function(image) {
    return image.expression('b() * (b() - 1) * (b() * 2 + 5)');
  };
  
  // NOTE (Eric): Band names for Landsat 5/7 
  var mir = 'SR_B7_median';
  var therm = 'ST_B6_median';
  var nir2 = 'SR_B5_median';
  var nir1 = 'SR_B4_median';
  var red = 'SR_B3_median';
  var green = 'SR_B2_median';
  var blue = 'SR_B1_median';
  
  var ext_geom = testAOI.first().geometry();
  
  // NOTE (Eric): Landsat 5 surface reflection data
  var L5coll = ee.ImageCollection('LANDSAT/LT05/C02/T1_L2')
   .map(cloudMask457_C2)
   //.map(ScaleFactors_LS5_C2)
   .filter("IMAGE_QUALITY == 9")
   //.filter(ee.Filter.gt('IMAGE_QUALITY',8))
   .filter("SATURATION_BAND_6 == 'N'")
  
  .filter(ee.Filter.lt('CLOUD_COVER',50))
  .filterBounds(ext_geom)
  .select(['SR_B1','SR_B2','SR_B3',
  'SR_B4','SR_B5','ST_B6','SR_B7', 
  'QA_PIXEL','QA_RADSAT']);
  
  // NOTE (Eric): Landat 8 surface reflection data w/ renamed bands.
  // See USGS pages for more info on band names
  var L8coll = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
   .map(cloudMask457_C2)
  .filter(ee.Filter.and(
      ee.Filter.or(
        ee.Filter.eq('IMAGE_QUALITY_TIRS', 9),
        ee.Filter.eq('IMAGE_QUALITY_OLI', 9))))
  .filter("SATURATION_BAND_9 == 'N'") // guessing that this is "Band 10 surface temperature"
  // .map(applyuint16)
  .filter(ee.Filter.lt('CLOUD_COVER',50))
  .filterBounds(ext_geom)
  .map(l8BandRename).select(['SR_B1','SR_B2','SR_B3',
  'SR_B4','SR_B5','ST_B6',
  'SR_B7', 'QA_PIXEL','QA_RADSAT']);
  
  // NOTE (Eric): Apply scaling factor to collections
  var L8coll = L8coll.map(applyScaleFactors);
  var L5coll = L5coll.map(applyScaleFactors);
  
  
  // NOTE (Eric): Merge Landsat 5 and Landsat 8 image collections
  var collection_merge = ee.ImageCollection(L5coll.merge(L8coll))
  .map(addYearProp);
  
  // NOTE (Eric): Mask all of the images in the collection
  //var collection_merge = collection_merge.map(maskImage);
  
  // NOTE (Eric): Add an NDVI band to each image in the collection
  var collection_merge = collection_merge.map(addNDVI);
  
  
  // NOTE (Eric): Filter the merged collection by years we want to include (1990 to 2020)
  var collection_merge = ee.ImageCollection(collection_merge.filter(ee.Filter.rangeContains('year', 1990, 2020)));
  //print('Collection merge: ', collection_merge);
  
  // NOTE (Eric): Define a list of unique observation years from 
  // the image collection.
  var years = collection_merge
  .aggregate_array('year')
  .distinct()
  .sort();
  
  // NOTE (Eric): Map over the list of years to build a list of 
  // annual image composites.
  var lsCompList = years
  .map(LastYr);
  
  // NOTE (Eric): Create a list that is the length of years we are using
  var len = lsCompList.size();
  var list = ee.List.sequence(0, len.subtract(1), n);
  
  var finalList = ee.ImageCollection.fromImages(list.map(Slicer).flatten()); // NOTE (Eric): We flatten the array to make it usable in 1D
  
  
  //print('3 year final list', finalList);
  //Map.addLayer(finalList.first().select('NDVI_median'));
  
  // NOTE (Eric): Fit a linear trend to NDVI + LST in the collection by adding the image
  // year as a time band to each image in the collection
  // For mapping in GEE, blue indicates a positive trend, red indicates a negative, and green brightness/darkness indicates
  // high/low magnitude
  var collection_ndvi = ee.ImageCollection(finalList
  .select('NDVI_median')
  .map(createTimeBand));
  
  var collection_lst = ee.ImageCollection(finalList
  .select('ST_B6_median')
  .map(createTimeBand));
  
  
  var NDVILinFit = ee.Image(collection_ndvi.reduce(ee.Reducer.linearFit())).clip(ext_geom);
  var LSTLinFit = ee.Image(collection_lst.reduce(ee.Reducer.linearFit())).clip(ext_geom);
  
  // NOTE (Eric): Join the time series to themselves to examine every possible ordered pair
  // of unique values in time series. This allows us to compute non-parametric stats. 
  // See https://developers.google.com/earth-engine/tutorials/community/nonparametric-trends
  
  var collection_ndvi = ee.Image(ee.ImageCollection(finalList
  .select('NDVI_median')
  .copyProperties(finalList.select('NDVI_median'),['system:time_start'])).toBands()).clip(ext_geom);
  
  //print('NDVI median collection', collection_ndvi);
  
  var collection_lst = ee.Image(ee.ImageCollection(finalList
  .select('ST_B6_median')
  .copyProperties(finalList.select('ST_B6_median'), ['system:time_start'])).toBands()).clip(ext_geom);
  
  //Map.addLayer(NDVILinFit,
  //{min: [0, 0.01, 0], max: [0.004, 0.7, -0.004], bands: ['scale', 'offset', 'scale']},
  //       'NDVI Trend');
         
  // NOTE (Eric): Display trend in LST
  //Map.addLayer(LSTLinFit,
  //{min: [22, 40000, 22], max: [75, 47000, -10], bands: ['scale', 'offset', 'scale']},
  //       'LST Trend');
         
  // NOTE (Eric): Make a histogram of scale and offset variables from linear fit, set the options.
  var NDVIhistogram = ui.Chart.image.histogram(NDVILinFit.clip(ext_geom), ext_geom, 30);
  var LSThistogram = ui.Chart.image.histogram(LSTLinFit.clip(ext_geom), ext_geom, 120);
  
  // NOTE (Eric): Display the histogram.
  print(NDVIhistogram);
  print(LSThistogram);
  
  Map.setCenter(-122.26,38.17,14);
  
  // NOTE (Eric): Export NDVI Trends to Google Drive
  
  Export.image.toDrive({image: NDVILinFit, description: 'NDVILinearFit3yr1990to2020',
                  folder: "EEJSpatialTrendRasters", scale: 30 , region: ext_geom ,
                  maxPixels:1e13});
  
  // NOTE (Eric): Export LST Trends to Google Drive
  
  Export.image.toDrive({image: LSTLinFit, description: 'LSTLinearFit3yr1990to2020',
                  folder: "EEJSpatialTrendRasters", scale: 120 , region: ext_geom ,
                  maxPixels:1e13});
  
  // NOTE (Eric): Export NDVI image collection as multi-band single raster
  
  Export.image.toDrive({image: collection_ndvi, description: 'NDVI3yrTimeSeries1990to2020',
                  folder: "EEJSpatialTrendRasters", scale: 30 , region: ext_geom ,
                  maxPixels:1e13});
  
  // NOTE (Eric): Export LST image collection as multi-band single raster
  
  Export.image.toDrive({image: collection_lst, description: 'LST3yrTimeSeries1990to2020',
                  folder: "EEJSpatialTrendRasters", scale: 120 , region: ext_geom ,
                  maxPixels:1e13});
  
  
  