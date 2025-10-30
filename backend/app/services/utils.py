from shapely.wkt import loads as wkt_loads
from shapely.geometry import mapping
from geoalchemy2.elements import WKBElement
from geoalchemy2.shape import to_shape

def slugify(text):
    """Convert text to URL-friendly format"""
    import re
    text = text.lower().strip()
    text = re.sub(r'[^\w\s-]', '', text)
    text = re.sub(r'[\s_-]+', '-', text)
    text = re.sub(r'^-+|-+$', '', text)
    return text

def wkt_to_geojson(geom):
    """
    Convert WKT geometries or WKBElement to GeoJSON geometry.
    Supports Polygon and Point.
    """
    try:
        if isinstance(geom, WKBElement):
            shapely_geom = to_shape(geom)
        elif isinstance(geom, str):
            shapely_geom = wkt_loads(geom)
        else:
            raise TypeError(f"Unsupported geometry type: {type(geom)}")

        return mapping(shapely_geom)

    except Exception as e:
        print(f"Error converting geometry to GeoJSON: {e}")
        return None