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

def AddRasterStatistics(shp_fn: str, ndvi_stats_rast: str, lst_stats_rast: str,
                         ndvi_time_series_rast: str, lst_time_series_rast: str,
                         band_idx: int, GreenSpaceClassRaster: str):

    """""
    Function takes input census tract shapefile and appends raster statistics as new columns.

    shp_fn: string: path to census tract shape file name
    ndvi_stats_rast: string: path to ndvi raster file whose statstistic we will append
    lst_stats_rast: string: path to lst raster file whose statstistic we will append
    ndvi_time_series_rast: path to ndvi time series raster where we will extract avg ndvi values for a given year (band_idx)
    lst_time_series_rast: path to lst time series raster where we will extract avg lst values for a given year (band_idx)
    band_idx: band number that will be used to extract average ndvi and lst values for a specified year
    GreenSpaceClassRaster: Raster of classified green space to collect total contributing green space per census tract

    """""
    t1 = process_time()

    #NOTE (Eric): Ensure paths exist
    assert isfile(shp_fn), f'[ERROR] File {shp_fn} not found. Exiting.'
    assert isfile(ndvi_stats_rast), f'[ERROR] File {ndvi_stats_rast} not found. Exiting.'
    assert isfile(lst_stats_rast), f'[ERROR] File {lst_stats_rast} not found. Exiting.'

    tif_files = [ndvi_stats_rast, lst_stats_rast]

    #NOTE (Eric): Extract arrays and spatial reference info for NDVI + LST snapshots and green space classification
    ndvi_snap_ds = gdal.Open(ndvi_time_series_rast)
    lst_snap_ds = gdal.Open(lst_time_series_rast)
    greenSpace_ds = gdal.Open(GreenSpaceClassRaster)

    ndvi_snap_gt = ndvi_snap_ds.GetGeoTransform()
    lst_snap_gt = lst_snap_ds.GetGeoTransform()
    greenSpace_gt = greenSpace_ds.GetGeoTransform()

    ndvi_snap_affine = rio.Affine(ndvi_snap_gt[1], ndvi_snap_gt[2], ndvi_snap_gt[0],
                                   ndvi_snap_gt[4], ndvi_snap_gt[5], ndvi_snap_gt[3])
    
    lst_snap_affine = rio.Affine(lst_snap_gt[1], lst_snap_gt[2], lst_snap_gt[0],
                                   lst_snap_gt[4], lst_snap_gt[5], lst_snap_gt[3])
    
    greenSpace_affine = rio.Affine(greenSpace_gt[1], greenSpace_gt[2], greenSpace_gt[0],
                                   greenSpace_gt[4], greenSpace_gt[5], greenSpace_gt[3])
    
    ndvi_snap_arr = ndvi_snap_ds.GetRasterBand(band_idx).ReadAsArray()
    lst_snap_arr = lst_snap_ds.GetRasterBand(band_idx).ReadAsArray()
    greenSpace_arr = greenSpace_ds.GetRasterBand(1).ReadAsArray()


    #NOTE (Eric): Census tract id field name we will use to filter the stats by
    filt_field_name = 'GEOID'

    #NOTE (Eric): Pre-define stats to extract
    stats_list = ['median']
    
    #NOTE (Eric): Open shapefile as geopandas gdf
    gdf = gpd.read_file(shp_fn)

    #NOTE (Eric): Extract the tract ids as a list
    tract_ids = gdf[filt_field_name].tolist()

    #NOTE (Eric): Open shapefile and append stats as a new column
    shp_ds = ogr.Open(shp_fn, 1)
    layer = shp_ds.GetLayer()

    #NOTE (Eric): Define new static fields
    median_ndvi_field_dfn = ogr.FieldDefn('medianNDVI', ogr.OFTReal)
    median_lst_field_dfn = ogr.FieldDefn('medianLST', ogr.OFTReal)
    greenArea_field_dfn = ogr.FieldDefn('greenArea', ogr.OFTReal)
    waterArea_field_dfn = ogr.FieldDefn('waterArea', ogr.OFTReal)
    urbanArea_field_dfn = ogr.FieldDefn('urbanArea', ogr.OFTReal)

    layer.CreateField(median_ndvi_field_dfn)
    layer.CreateField(median_lst_field_dfn)
    layer.CreateField(greenArea_field_dfn)
    layer.CreateField(waterArea_field_dfn)
    layer.CreateField(urbanArea_field_dfn)

    #NOTE (Eric): Iterate over stats rasters and create shapefile field headers based on band names
    for tif_file in tif_files:

        rast_ds = gdal.Open(tif_file)
        no_bands = rast_ds.RasterCount

        #NOTE (Eric): Set field header based on ndvi or lst in filename
        if 'NDVI' in rast_ds.GetDescription():
            field_header = 'ndvi_'
        else:
            field_header = 'lst_'

        for band_no in range(no_bands):
            
            #NOTE (Eric): Read raster bands and set field headers based on band descriptions
            band = rast_ds.GetRasterBand(band_no + 1)
            bandDesc = band.GetDescription()

            field_name = field_header + bandDesc[:5]
            
            #NOTE (Eric): Define the new field
            field_dfn = ogr.FieldDefn(field_name, ogr.OFTReal)

            #NOTE (Eric): Create new field column in shapefile
            layer.CreateField(field_dfn)
        

    #NOTE (Eric): Iterate over census tract IDs and calculate stats
    t3 = process_time()
    f=0
    for tract_id in tract_ids:

        if f>0:
            print(f'Time to process {f} feature(s) {(t4-t3)} seconds')

        total_area_list = []
        
        #NOTE (Eric): Filter gdf to contain only the current tract id
        filt_gdf = gdf[gdf[filt_field_name] == tract_id]

        #NOTE (Eric): Dissolve by the tract ID of interest
        dissolved_gdf = filt_gdf.dissolve(by=filt_field_name)

        #NOTE (Eric): Calculate zonal medians for lst and ndvi
        median_ndvi = zonal_stats(dissolved_gdf, ndvi_snap_arr, stats=stats_list, all_touched=True, affine=ndvi_snap_affine)
        median_lst = zonal_stats(dissolved_gdf, lst_snap_arr, stats=stats_list, all_touched=True, affine=lst_snap_affine)

        #NOTE (Eric): Determine how much area is covered by our three classes (1 - Green, 2 - Water, 3 - Urban)

        for i in range(3):
            #NOTE (Eric): We are going to logically filter the class raster to only include values for green spaces
            greenSpace_arr_indx = greenSpace_arr == i+1
            total_green_space_stat = zonal_stats(dissolved_gdf, greenSpace_arr_indx, stats=['sum'], all_touched=True, affine=greenSpace_affine,  nodata=0,)
        
            if total_green_space_stat[0]['sum'] == None:
                total_green_space = 0
                total_area_list.append(total_green_space)
            else:
                total_green_space = total_green_space_stat[0]['sum']
                total_area_list.append(total_green_space)

        #NOTE (Eric): Filter the layer by current feature ID (ogr) 
        layer.SetAttributeFilter(f"{filt_field_name} = '{tract_id}'")

        
        for feat in layer:
            feat.SetField('medianNDVI', median_ndvi[0]['median'])
            feat.SetField('medianLST', median_lst[0]['median'])
            feat.SetField('greenArea', total_area_list[0] * 5 * 5)
            feat.SetField('waterArea', total_area_list[1] * 5 * 5)
            feat.SetField('urbanArea', total_area_list[2] * 5 * 5)
            layer.SetFeature(feat)
        
        #NOTE (Eric): Iterate over stats rasters and collect median values by filtered census tract ID
        for tif_file in tif_files:

            rast_ds = gdal.Open(tif_file)
            gt = rast_ds.GetGeoTransform()
            affine = rio.Affine(gt[1], gt[2], gt[0], gt[4], gt[5], gt[3])
            no_bands = rast_ds.RasterCount

            #NOTE (Eric): Set field header based on ndvi or lst in filename
            if 'NDVI' in rast_ds.GetDescription():
                field_header = 'ndvi_'
            else:
                field_header = 'lst_'

            for band_no in range(no_bands):
                
                #NOTE (Eric): Read raster bands and get field headers based on band descriptions
                band = rast_ds.GetRasterBand(band_no + 1)
                bandDesc = band.GetDescription()
                arr = band.ReadAsArray()
                field_name = field_header + bandDesc[:5]

                this_tract_stats = zonal_stats(dissolved_gdf, arr, stats=stats_list, all_touched=True, affine=affine, nodata=-9999.0)

                for feat in layer:
                    feat.SetField(f"{field_name}",this_tract_stats[0]['median'])
                    layer.SetFeature(feat)
       
        t4 = process_time()
        f+=1

    t2 = process_time()
    total_time = t2-t1
    print(f'\nComplete. Stats appended to {shp_fn}')
    print(f'\nTotal analysis time: {total_time/60} minutes.')


if __name__ == "__main__": 
    from sys import argv
    try:
        AddRasterStatistics(argv[1], argv[2], argv[3], 
                            argv[4], argv[5], int(argv[6]),
                            argv[7])
    except Exception as e:
        print(e)    


