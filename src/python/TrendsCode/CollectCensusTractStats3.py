# Code written to calculate mean statistics from statistical rasters representing 
# trend in NDVI and LST over the San Francisco Bay Area from 1990 to 2019
# Stat rasters include: slope, intercept, correlation, p-value, t-statistic, standard
# error and covariance
# Author: Eric Romero
# Date: 6/12/2023

import geopandas as gpd
import rasterio as rio
import numpy as np
import os

from osgeo import gdal, ogr
from os.path import isfile, isdir
from rasterstats import zonal_stats
from gc import collect
from time import process_time
from rasterio.mask import mask
import matplotlib.pyplot as plt
from scipy.stats import t

def AddRasterStatistics(shp_fn: str, ndvi_time_series_rast: str, lst_time_series_rast: str,
                         band_idx: int, GreenSpaceClassRaster: str):

    """""
    Function takes input census tract shapefile and appends raster statistics as new columns.

    shp_fn: string: path to census tract shape file name
    ndvi_time_series_rast: path to ndvi time series raster where we will extract median ndvi values for a given year (band_idx)
    lst_time_series_rast: path to lst time series raster where we will extract median lst values for a given year (band_idx)
    band_idx: band number that will be used to extract average ndvi and lst values for a specified year
    GreenSpaceClassRaster: Raster of classified green space to collect total contributing green space per census tract

    """""
    t1 = process_time()

    #NOTE (Eric): Ensure paths exist
    assert isfile(shp_fn), f'[ERROR] File {shp_fn} not found. Exiting.'
    assert isfile(ndvi_time_series_rast), f'[ERROR] File {ndvi_time_series_rast} not found. Exiting.'
    assert isfile(lst_time_series_rast), f'[ERROR] File {lst_time_series_rast} not found. Exiting.'

    #NOTE (Eric): Extract spatial reference info for NDVI, LST (time series data) and classified green space
    ndvi_ts_ds = gdal.Open(ndvi_time_series_rast)
    lst_ts_ds = gdal.Open(lst_time_series_rast)
    greenSpace_ds = gdal.Open(GreenSpaceClassRaster)
    
    #NOTE (Eric): Extract nodata values
    ndvi_nodata = ndvi_ts_ds.GetRasterBand(1).GetNoDataValue()
    lst_nodata = lst_ts_ds.GetRasterBand(1).GetNoDataValue()
    gsc_nodata = greenSpace_ds.GetRasterBand(1).GetNoDataValue()
    
    #NOTE (Eric): Extract arrays of NDVI, LST, and green space classification rasters into memory
    ndvi_src = rio.open(ndvi_time_series_rast)
    lst_src = rio.open(lst_time_series_rast)
    gsc_src = rio.open(GreenSpaceClassRaster)
    
    #NOTE (Eric): Intialize a list of year values for every middle year to iterate over
    start_year = 1990
    end_year = 2020

    years = list(range(start_year,end_year))

    #NOTE (Eric): Now we calculate the number of years since 1985 for each median year
    since = []
    for year in years:
        since.append(year - start_year)

    #NOTE (Eric): Create a time array for linear trend analysis
    time_data = []
    for year in since:

        time_data.append(year)

    #NOTE (Eric): Convert time list to stacked array
    time_data = np.dstack(time_data)

    #NOTE (Eric): Store time stats for future linear trend analysis
    n = time_data.shape[2]
    xmean = np.nanmean(time_data, axis=2)
    xmean_arr = np.dstack([xmean]*n)
    xstd  = np.nanstd(time_data, axis=2)

    #NOTE (Eric): Census tract/zip code id field name we will use to filter the stats by (Census tract: 'GEOID', zip code: 'zcta')
    filt_field_name = 'zcta'
    
    #NOTE (Eric): Open shapefile as geopandas gdf
    gdf = gpd.read_file(shp_fn)

    #NOTE (Eric): Extract the tract ids as a list
    tract_ids = gdf[filt_field_name].tolist()

    #NOTE (Eric): Open shapefile and append stats as a new column
    shp_ds = ogr.Open(shp_fn, 1)
    layer = shp_ds.GetLayer()

    #NOTE (Eric): Define new static fields
    stat_labs = ['cov', 'corr', 'int', 'med', 'pval', 'slope', 'stderr', 'tstat']
    ts_rast_labs = ['NDVI', 'LST']

    greenArea_field_dfn = ogr.FieldDefn('greenArea', ogr.OFTReal)
    waterArea_field_dfn = ogr.FieldDefn('waterArea', ogr.OFTReal)
    urbanArea_field_dfn = ogr.FieldDefn('urbanArea', ogr.OFTReal)

    layer.CreateField(greenArea_field_dfn)
    layer.CreateField(waterArea_field_dfn)
    layer.CreateField(urbanArea_field_dfn)

    for  ts_rast_lab in ts_rast_labs:
        for stat_lab in stat_labs:

            field_dfn = ogr.FieldDefn(f'{stat_lab}{ts_rast_lab}', ogr.OFTReal)
            layer.CreateField(field_dfn)

    for tract_id in tract_ids:
        
        #NOTE (Eric): Filter the census tracts by unique ID
        filt_gdf = gdf[gdf[filt_field_name] == tract_id]
        
        #NOTE (Eric): Clip the in-mem rasters using the filtered shapefile geometry
        try:
            in_mem_ndvi, ndvi_out_transform = mask(ndvi_src, filt_gdf.geometry, crop=True)
            in_mem_lst, lst_out_transform = mask(lst_src, filt_gdf.geometry, crop=True)
            in_mem_gsc, gsc_out_transform = mask(gsc_src, filt_gdf.geometry, crop=True)
        
        except Exception as e:
            continue
         

        #NOTE (Eric): Set NDVI/LST nodata = np.nan
        in_mem_ndvi[in_mem_ndvi == ndvi_nodata] = np.nan
        in_mem_lst[in_mem_lst == lst_nodata] = np.nan
        

        #NOTE (Eric): Copy and update the metadatas
        ndvi_out_meta = ndvi_src.meta.copy()
        lst_out_meta = ndvi_src.meta.copy()
        gsc_out_meta = ndvi_src.meta.copy()

        ndvi_out_meta.update({
            "driver": "GTiff",
            "height": in_mem_ndvi.shape[1],
            "width": in_mem_ndvi.shape[2],
            "transform": ndvi_out_transform})
        
        lst_out_meta.update({
            "driver": "GTiff",
            "height": in_mem_ndvi.shape[1],
            "width": in_mem_ndvi.shape[2],
            "transform": lst_out_transform})
        
        gsc_out_meta.update({
            "driver": "GTiff",
            "height": in_mem_ndvi.shape[1],
            "width": in_mem_ndvi.shape[2],
            "transform": gsc_out_transform})
        
        #NOTE (Eric): Create empty arrays that will contain median NDVI/LST data
        ndvi_band_data = []
        lst_band_data = []
        
        #NOTE (Eric): Collect median NDVI/LST stats at each timestep
        for year in since:

            median_ndvi = np.nanmedian(in_mem_ndvi[year,:,:])
            median_lst = np.nanmedian(in_mem_lst[year,:,:])

            ndvi_band_data.append(median_ndvi)
            lst_band_data.append(median_lst)


        #NOTE (Eric): Convert NDVI and LST lists to stacked arrays
        ndvi_band_data = np.dstack(ndvi_band_data)
        lst_band_data = np.dstack(lst_band_data)
        
        #NOTE (Eric): Perform linear trend analysis using the annual tract-level medians for NDVI + LST
        for band_data, ts_rast_lab in zip([ndvi_band_data, lst_band_data], ts_rast_labs):

            ymean = np.nanmean(band_data, axis=2)
            ymean_arr = np.dstack([ymean]*n)
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

            #NOTE (Eric): Filter the layer by current feature ID (ogr) 
            layer.SetAttributeFilter(f"{filt_field_name} = '{tract_id}'")

            for feat in layer:
                feat.SetField(f'{stat_labs[0]}{ts_rast_lab}', cov[0][0])
                feat.SetField(f'{stat_labs[1]}{ts_rast_lab}', cor[0][0])
                feat.SetField(f'{stat_labs[2]}{ts_rast_lab}', intercept[0][0])
                feat.SetField(f'{stat_labs[3]}{ts_rast_lab}', float(band_data[0,0, band_idx]))
                feat.SetField(f'{stat_labs[4]}{ts_rast_lab}', pval[0][0])
                feat.SetField(f'{stat_labs[5]}{ts_rast_lab}', slope[0][0])
                feat.SetField(f'{stat_labs[6]}{ts_rast_lab}', stderr[0][0])
                feat.SetField(f'{stat_labs[7]}{ts_rast_lab}', tstats[0][0])
                layer.SetFeature(feat)
        
        #NOTE (Eric): Filter the layer by current feature ID (ogr) 
        layer.SetAttributeFilter(f"{filt_field_name} = '{tract_id}'")

        #NOTE (Eric): Determine how much area is covered by our three classes (1 - Green, 2 - Water, 3 - Urban)
        for i, class_lab, in zip([1,2,3],['green', 'water', 'urban']):

            #NOTE (Eric): We are going to logically filter the class raster to only include values for green spaces
            greenSpace_arr_indx = in_mem_gsc == i
            class_area = greenSpace_arr_indx.sum() * 5 * 5

            for feat in layer:
                feat.SetField(f'{class_lab}Area', float(class_area))
                layer.SetFeature(feat)


        


if __name__ == "__main__": 
    from sys import argv
    try:
        AddRasterStatistics(argv[1], argv[2], argv[3], 
                            int(argv[4]), argv[5])
    except Exception as e:
        print(e)    


