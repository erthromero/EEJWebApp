# Code writte to perform object-based classification accuracy assessment of
# green space classification over the San Francisco Bay Area. 
# Author: Eric Romero
# Date: 8/10/2023



from osgeo import gdal 
from os.path import isfile
import numpy as np

def PolygonAccuracy(polygon_rast: str, class_rast: str):
    
    """""
    Function takes rasterized validation polygons and performs polygon-based accuracy assessment of 
    classified raster. Assessment appropriate for geographic object-based image classifications.
    Geospatial extents and reference of polygon and class rasters must match, as well as classification schemas.

    polygon_rast: path to rasterized validation polygons
    class_rast: path to classified raster

    """""

    assert isfile(polygon_rast), f'[ERROR] File {polygon_rast} not found. Exiting.'
    assert isfile(class_rast), f'[ERROR] File {class_rast} not found. Exiting.'

    val_ds = gdal.Open(polygon_rast)
    class_ds = gdal.Open(class_rast)

    val_arr = val_ds.GetRasterBand(1).ReadAsArray()
    class_arr = class_ds.GetRasterBand(1).ReadAsArray()

    min_class = 1
    max_class = class_arr.max()

    conf_mat = np.zeros((max_class,max_class))

    for i in range(1,max_class+1):
        val_mask = val_arr == i
        class_masked = class_arr[val_mask]
        for j in range(1,max_class+1):
            class_masked_ij = class_masked == j
            sum_ij = np.count_nonzero(class_masked_ij) * 25
            conf_mat[j-1,i-1] = sum_ij
    
    np.savetxt('D:\\EEJ\\ObjectBasedAccuracy\\ConfusionMatrix.csv', conf_mat, delimiter=',')
    
    print('Complete.')

if __name__ == "__main__": 
    from sys import argv
    try:
        PolygonAccuracy(argv[1], argv[2])
    except Exception as e:
        print(e)    