# Code written to extract p-values from Landsat time series rasters of greenness 
# (NDVI) and land surface temperature (LST). Time series rasters have been aggregated
# to 3-year medians, where the 3-year median value at each pixel has been placed into 
# each band of the raster. Analysis period: 1990- 2019
# Author: Eric Romero
# Date: 6/12/2023

from osgeo import gdal, ogr
from scipy.stats import t
from os.path import isfile

import numpy as np 

def WarpToMatchResolution(src_ds: str, match_ds: str, dst_fn: str,
                           resample_alg: str, cutline_fn):
    
    """""
    Function creates matches spatial resolution and spatial reference
    of source raster to that of the matched raster dataset.

    src_fn: file path to raster data on disk
    match_fn: file path to the raster whose reference we want to mimic
    src_fn_base: filename extension of source dataset with file extension (e.g., .tif) removed
    resample alg: gdal compatible string indicating resample algorithm
    cutline_fn: Vector data to limit analysis area

    """""

    # NOTE (Eric): Extract extent data to convert input raster to output extent + resolution.
    src_srs = src_ds.GetSpatialRef()

    match_srs = match_ds.GetSpatialRef()
    match_gt = match_ds.GetGeoTransform()

    match_width = match_ds.RasterXSize
    match_height = match_ds.RasterYSize

    match_x_res = match_gt[1]
    match_y_res = match_gt[5]

    match_ulx = match_gt[0]
    match_lrx = match_ulx + match_x_res * match_width

    match_uly = match_gt[3]
    match_lry = match_uly + match_y_res * match_height

    match_bounds = [match_ulx, match_lry, match_lrx, match_uly]

    #NOTE (Eric): Get src data type and nodata value
    gdal_no_data_value = src_ds.GetRasterBand(1).GetNoDataValue()
    gdal_data_type = src_ds.GetRasterBand(1).DataType
    
    if gdal_no_data_value is None:   
        gdal_no_data_value = -9999

    # NOTE (Eric): If input cutline is valid, clip the output raster by extent
    cutline_ds = ogr.Open(cutline_fn)
    cutline_layer = cutline_ds.GetLayer()
    cutline_ds_name = cutline_ds.GetName()
    cutline_layer_name = cutline_layer.GetName()
    cutline_extent = cutline_layer.GetExtent()
    match_width = int((cutline_extent[1] - cutline_extent[0]) / match_x_res)
    match_height = int((cutline_extent[2] - cutline_extent[3] ) / match_y_res)
    match_bounds = [cutline_extent[0], cutline_extent[2], cutline_extent[1], cutline_extent[3]]
    print('Beginning warping process.')

    creation_options = ['BIGTIFF = IF_NEEDED', 'COMPRESS = LZW', 
                    'PREDICTOR=3', 'Tiled=YES', 'BLOCKXSIZE=256',
                        'BLOCKYSIZE=256', 'SPARSE_OK=True', 'NUM_THREADS=ALL_CPUS']
        
    gdal.Warp(dst_fn, src_ds, format='GTIFF', multithread='YES',
              dstNodata = gdal_no_data_value, outputType = gdal_data_type, 
              width=match_width, height=match_height, outputBoundsSRS=match_srs,
              outputBounds=match_bounds, srcSRS=src_srs, dstSRS=match_srs,
              resampleAlg=resample_alg, cutlineDSName=cutline_ds_name,
              cutlineLayer=cutline_layer_name, options=creation_options)

def RasterLinModel(raster_fn: str, start_year: int, end_year: int):
    """""
    Function takes input raster which contains 3 year median values of a variable of interest.
    Year rasters of the same size and shape of the input raster is created using the designated 
    start year and end year.

    raster_fn: string: path to raster for analysis
    start_year: int: year of beginning analysis (inclusive)
    end_year: int: year of ending analysis (inclusive)

    Followed guidance here: https://hrishichandanpurkar.blogspot.com/2017/09/vectorized-functions-for-correlation.html

    """""
    #NOTE (Eric): Ensure input file is valid
    assert isfile(raster_fn), f'[ERROR] File {raster_fn} not found. Exiting.'

    #NOTE (Eric): Set output file name statistical raster based on input filename
    in_fn_components = raster_fn.split('\\')
    out_fn = 'D:\\EEJ\\Trends\\TrendData\\StatsRasters\\' + '\\' + in_fn_components[-1][:-4] + 'LinearTrendStats.tif'

    #NOTE (Eric): Intialize a list of year values for every middle year to iterate over
    years = list(range(start_year+1,end_year+1,3))

    #NOTE (Eric): Now we calculate the number of years since 1985 for each median year
    since = []
    for year in years:
        since.append(year - start_year)


    #NOTE (Eric): Spatial Reference
    ds = gdal.Open(raster_fn)
    gt = ds.GetGeoTransform()
    proj = ds.GetProjection()
    srs = ds.GetSpatialRef()
    
    #NOTE (Eric): Dimensions
    cols = ds.RasterXSize
    rows = ds.RasterYSize
    bands = ds.RasterCount

    band_data = []
    time_data = []
    for band in range(bands):

        year = since[band]
        arr = ds.GetRasterBand(band+1).ReadAsArray()
        time_arr = np.full(arr.shape, year, dtype=np.float64)
        
        #NOTE (Eric): Replace nodata with nans
        nodata = ds.GetRasterBand(band+1).GetNoDataValue()
        arr[arr == nodata] = np.nan
        time_arr[arr == nodata] = np.nan 

        band_data.append(arr)
        time_data.append(time_arr)
    
    band_data = np.dstack(band_data)
    time_data = np.dstack(time_data)

    # Compute data length, mean and standard deviation along time axis for further use: 
    n = band_data.shape[2]
    xmean = np.nanmean(time_data, axis=2)
    xmean_arr = np.dstack([xmean]*n)
    ymean = np.nanmean(band_data, axis=2)
    ymean_arr = np.dstack([ymean]*n)
    xstd  = np.nanstd(time_data, axis=2)
    ystd  = np.nanstd(band_data, axis=2)

    # Compute covariance along time axis
    cov =  np.nansum((time_data - xmean_arr)*(band_data - ymean_arr), axis=2)/(n)
    
    # Compute correlation along time axis
    cor = cov/(xstd*ystd)
    
    # Compute regression slope and intercept:
    slope = cov/(xstd**2)
    intercept = ymean - xmean*slope  
    
    # Compute P-value and standard error
    # Compute t-statistics
    tstats = cor*np.sqrt(n-2)/np.sqrt(1-cor**2)
    stderr = slope/tstats
    pval   = t.sf(tstats, n-2)*2

    #NOTE (Eric): Create matching list of statistic labels and variables
    stat_labs = ['covaraince', 'correlation', 'slope', 'intercept', 'tstat', 'stderr', 'pval']
    stat_list = [cov, cor, slope, intercept, tstats, stderr, pval]

    #NOTE (Eric): Now, we will write our statistical rasters to disk
    driver = gdal.GetDriverByName("MEM")
    out_ds = driver.Create('mem_raster', cols, rows, 7, gdal.GDT_Float64)#, options=creation_options)

    out_ds.SetGeoTransform(gt)
    out_ds.SetProjection(proj)
    out_ds.SetSpatialRef(srs)

    #NOTE (Eric): Shapefile for clipping
    clipping_cutline_fn = "D:\\EEJ\\StateData\\shp\\BayAreaBlockGroupsDissolved.shp"
    assert isfile(clipping_cutline_fn), f'[ERROR] File {clipping_cutline_fn} not found. Exiting.'

    b = 0
    for stat, lab in list(zip(stat_list, stat_labs)):
        b+=1
      
        out_ds.GetRasterBand(b).SetNoDataValue(-9999.0)
        out_ds.GetRasterBand(b).SetDescription(lab)
        out_ds.GetRasterBand(b).WriteArray(stat)
        
    WarpToMatchResolution(out_ds, out_ds, out_fn, 'near', clipping_cutline_fn)
    out_ds = None



if __name__ == "__main__": 
    from sys import argv
    try:
        RasterLinModel(argv[1], int(argv[2]), int(argv[3]))
    except Exception as e:
        print(e)    

