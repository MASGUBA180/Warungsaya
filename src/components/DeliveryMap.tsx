/// <reference types="google.maps" />
import {
  AdvancedMarker,
  APILoadingStatus,
  APIProvider,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import {ExternalLink, MapPin, Navigation, Store, Truck} from 'lucide-react';
import {useEffect, useMemo, useRef, useState} from 'react';
import {DELIVERY_CHECKPOINT_LABELS} from '../lib/storeData';
import type {DeliveryTrackingInfo, GeoPoint, OrderStatus} from '../types/store';

const MAPS_API_KEY = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();

export interface DeliveryMapProps {
  mapInstanceId: string;
  storeName?: string;
  storeAddress?: string;
  storeCoords?: GeoPoint | null;
  customerLabel?: string;
  customerAddress?: string;
  customerCoords?: GeoPoint | null;
  courierName?: string;
  orderStatus?: OrderStatus;
  tracking?: DeliveryTrackingInfo;
  mapsUrl?: string;
  heightClass?: string;
  interactivePickTarget?: 'courier' | 'store';
  onPickCoords?: (coords: GeoPoint) => void;
}

function haversineDistanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function getEffectiveProgress(
  orderStatus?: OrderStatus,
  tracking?: DeliveryTrackingInfo
): number {
  if (orderStatus === 'SELESAI') return 100;
  if (tracking) return Math.min(100, Math.max(0, tracking.progressPercent));
  if (orderStatus === 'DIANTAR') return 55;
  if (orderStatus === 'DISIAPKAN') return 25;
  return 15;
}

function MapsInnerLayer({
  mapInstanceId,
  storeName,
  storeAddress,
  storeCoords,
  customerLabel,
  customerAddress,
  customerCoords,
  courierName,
  orderStatus,
  tracking,
  interactivePickTarget,
  onPickCoords,
  onFallbackTriggered,
}: {
  mapInstanceId: string;
  storeName: string;
  storeAddress: string;
  storeCoords?: GeoPoint | null;
  customerLabel?: string;
  customerAddress?: string;
  customerCoords?: GeoPoint | null;
  courierName?: string;
  orderStatus?: OrderStatus;
  tracking?: DeliveryTrackingInfo;
  interactivePickTarget?: 'courier' | 'store';
  onPickCoords?: (coords: GeoPoint) => void;
  onFallbackTriggered: () => void;
}) {
  const status = useApiLoadingStatus();
  const map = useMap(mapInstanceId);
  const placesLib = useMapsLibrary('places');
  const routesLib = useMapsLibrary('routes');

  const [resolvedStoreCoords, setResolvedStoreCoords] = useState<GeoPoint | null>(
    storeCoords ?? null
  );
  const [routeDistanceText, setRouteDistanceText] = useState<string>('');
  const [selectedMarker, setSelectedMarker] = useState<
    'store' | 'courier' | 'customer' | null
  >(null);

  const [storeMarkerRef, storeMarker] = useAdvancedMarkerRef();
  const [courierMarkerRef, courierMarker] = useAdvancedMarkerRef();
  const [customerMarkerRef, customerMarker] = useAdvancedMarkerRef();
  const polylineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (
      status === APILoadingStatus.FAILED ||
      status === APILoadingStatus.AUTH_FAILURE
    ) {
      onFallbackTriggered();
    }
  }, [status, onFallbackTriggered]);

  useEffect(() => {
    if (storeCoords) {
      setResolvedStoreCoords(storeCoords);
    }
  }, [storeCoords]);

  // Lookup real store area via Places API New when owner hasn't manually pinned storeCoords
  useEffect(() => {
    if (storeCoords || !placesLib) return;
    let active = true;
    const query =
      storeAddress || 'Gunung Batin Udik, Terusan Nunyai, Lampung Tengah, Indonesia';

    placesLib.Place.searchByText({
      textQuery: query,
      fields: ['location', 'displayName'],
      maxResultCount: 1,
    })
      .then((res) => {
        if (!active) return;
        const loc = res.places?.[0]?.location;
        if (loc) {
          setResolvedStoreCoords({
            lat: Number(loc.lat().toFixed(6)),
            lng: Number(loc.lng().toFixed(6)),
          });
        }
      })
      .catch(() => {
        // Keep map interactive even if text search fails
      });

    return () => {
      active = false;
    };
  }, [storeCoords, placesLib, storeAddress]);

  const effectiveStore = resolvedStoreCoords;
  const effectiveCourier = tracking?.courierCoords ?? null;
  const effectiveCustomer = customerCoords ?? null;

  // Adjust map bounds to fit active pins
  useEffect(() => {
    if (!map) return;
    const points = [effectiveStore, effectiveCourier, effectiveCustomer].filter(
      (p): p is GeoPoint => Boolean(p)
    );
    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(15);
    } else if (points.length >= 2) {
      const bounds = new google.maps.LatLngBounds();
      points.forEach((pt) => bounds.extend(pt));
      map.fitBounds(bounds, 56);
    }
  }, [map, effectiveStore, effectiveCourier, effectiveCustomer]);

  // Render route polyline using Routes API (with straight polyline fallback for rural alleys)
  useEffect(() => {
    if (!map) return;
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
    setRouteDistanceText('');

    const origin = effectiveCourier || effectiveStore;
    const destination = effectiveCustomer;
    if (!origin || !destination) return;

    let cancelled = false;

    const drawDirectFallback = () => {
      if (cancelled) return;
      const distKm = haversineDistanceKm(origin, destination);
      setRouteDistanceText(`${distKm.toFixed(1)} km`);
      polylineRef.current = new google.maps.Polyline({
        path: [origin, destination],
        geodesic: true,
        strokeColor: '#14532D',
        strokeOpacity: 0.8,
        strokeWeight: 4,
        map,
      });
    };

    if (!routesLib) {
      drawDirectFallback();
      return () => {
        cancelled = true;
        polylineRef.current?.setMap(null);
      };
    }

    routesLib.Route.computeRoutes({
      origin,
      destination,
      travelMode: 'DRIVING',
      fields: ['distanceMeters', 'path'],
    })
      .then((response) => {
        if (cancelled) return;
        const route = response.routes?.[0];
        const pathPoints = route?.path?.map((pt) => ({
          lat:
            pt instanceof google.maps.LatLng
              ? pt.lat()
              : Number(pt.lat ?? 0),
          lng:
            pt instanceof google.maps.LatLng
              ? pt.lng()
              : Number(pt.lng ?? 0),
        }));
        if (pathPoints && pathPoints.length > 0) {
          polylineRef.current = new google.maps.Polyline({
            path: pathPoints,
            geodesic: true,
            strokeColor: '#14532D',
            strokeOpacity: 0.9,
            strokeWeight: 5,
            map,
          });
          if (route?.distanceMeters) {
            setRouteDistanceText(
              route.distanceMeters >= 1000
                ? `${(route.distanceMeters / 1000).toFixed(1)} km`
                : `${route.distanceMeters} m`
            );
          }
        } else {
          drawDirectFallback();
        }
      })
      .catch(() => {
        drawDirectFallback();
      });

    return () => {
      cancelled = true;
      if (polylineRef.current) {
        polylineRef.current.setMap(null);
        polylineRef.current = null;
      }
    };
  }, [map, routesLib, effectiveStore, effectiveCourier, effectiveCustomer]);

  const initialCenter = useMemo<GeoPoint>(
    () =>
      effectiveCourier ||
      effectiveCustomer ||
      effectiveStore || {lat: -4.83, lng: 105.23},
    [effectiveCourier, effectiveCustomer, effectiveStore]
  );

  return (
    <div className="relative w-full h-full">
      <GoogleMap
        id={mapInstanceId}
        mapId="DEMO_MAP_ID"
        defaultCenter={initialCenter}
        defaultZoom={15}
        gestureHandling="greedy"
        disableDefaultUI={false}
        streetViewControl={false}
        mapTypeControl={false}
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        className="w-full h-full"
        onClick={(ev) => {
          if (!interactivePickTarget || !onPickCoords || !ev.detail.latLng) return;
          onPickCoords({
            lat: Number(ev.detail.latLng.lat.toFixed(6)),
            lng: Number(ev.detail.latLng.lng.toFixed(6)),
          });
        }}
      >
        {effectiveStore && (
          <AdvancedMarker
            ref={storeMarkerRef}
            position={effectiveStore}
            title={storeName}
            onClick={() => setSelectedMarker('store')}
          >
            <Pin background="#14532D" borderColor="#052e16" glyphColor="#ffffff" />
          </AdvancedMarker>
        )}

        {effectiveCourier && (
          <AdvancedMarker
            ref={courierMarkerRef}
            position={effectiveCourier}
            title={courierName || 'Kurir Toko Dimas Jaya'}
            onClick={() => setSelectedMarker('courier')}
          >
            <Pin background="#b45309" borderColor="#78350f" glyphColor="#ffffff" scale={1.15} />
          </AdvancedMarker>
        )}

        {effectiveCustomer && (
          <AdvancedMarker
            ref={customerMarkerRef}
            position={effectiveCustomer}
            title={customerLabel || 'Lokasi Pelanggan'}
            onClick={() => setSelectedMarker('customer')}
          >
            <Pin background="#1d4ed8" borderColor="#1e3a8a" glyphColor="#ffffff" />
          </AdvancedMarker>
        )}

        {selectedMarker === 'store' && storeMarker && (
          <InfoWindow anchor={storeMarker} onCloseClick={() => setSelectedMarker(null)}>
            <div className="text-xs max-w-[200px] space-y-0.5">
              <p className="font-bold text-zinc-900">{storeName}</p>
              <p className="text-zinc-600">{storeAddress}</p>
            </div>
          </InfoWindow>
        )}

        {selectedMarker === 'courier' && courierMarker && (
          <InfoWindow anchor={courierMarker} onCloseClick={() => setSelectedMarker(null)}>
            <div className="text-xs max-w-[210px] space-y-0.5">
              <p className="font-bold text-amber-800">
                Kurir: {courierName || 'Petugas Antar'}
              </p>
              <p className="text-zinc-700">
                {tracking?.locationNote ||
                  (orderStatus === 'SELESAI'
                    ? 'Sudah tiba di tujuan'
                    : 'Sedang mengantar pesanan')}
              </p>
              {tracking?.etaMinutes !== undefined && tracking.etaMinutes > 0 && (
                <p className="text-zinc-500">Estimasi tiba: ±{tracking.etaMinutes} menit</p>
              )}
            </div>
          </InfoWindow>
        )}

        {selectedMarker === 'customer' && customerMarker && (
          <InfoWindow anchor={customerMarker} onCloseClick={() => setSelectedMarker(null)}>
            <div className="text-xs max-w-[200px] space-y-0.5">
              <p className="font-bold text-blue-900">{customerLabel || 'Alamat Tujuan'}</p>
              <p className="text-zinc-600">{customerAddress || 'Titik tujuan COD'}</p>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {routeDistanceText && (
        <div className="absolute top-2.5 left-2.5 bg-white/95 border border-zinc-200 rounded-md px-2.5 py-1 text-[11px] font-medium text-zinc-800 shadow-sm tabular-price">
          Jarak rute: {routeDistanceText}
        </div>
      )}

      {interactivePickTarget && (
        <div className="absolute bottom-2.5 left-2.5 right-12 sm:right-auto bg-zinc-900/90 text-white rounded-md px-2.5 py-1.5 text-[11px]">
          {interactivePickTarget === 'courier'
            ? 'Klik titik pada peta untuk memperbarui posisi pin kurir.'
            : 'Klik titik lokasi toko pada peta untuk menyimpan koordinat Toko Dimas Jaya.'}
        </div>
      )}
    </div>
  );
}

export function DeliveryMap({
  mapInstanceId,
  storeName = 'Toko Dimas Jaya',
  storeAddress = 'Gang Makam, Gunung Batin Udik, Kec. Terusan Nunyai, Lampung Tengah',
  storeCoords,
  customerLabel,
  customerAddress,
  customerCoords,
  courierName,
  orderStatus,
  tracking,
  mapsUrl,
  heightClass = 'h-64',
  interactivePickTarget,
  onPickCoords,
}: DeliveryMapProps) {
  const [quotaFallback, setQuotaFallback] = useState(false);

  useEffect(() => {
    const onQuota = () => setQuotaFallback(true);
    window.addEventListener('gmp-quota-exceeded', onQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuota);
  }, []);

  const progress = getEffectiveProgress(orderStatus, tracking);
  const checkpointInfo = tracking?.checkpoint
    ? DELIVERY_CHECKPOINT_LABELS[tracking.checkpoint]
    : null;
  const hasArrived =
    orderStatus === 'SELESAI' || tracking?.checkpoint === 'SUDAH_TIBA';

  const useInteractiveGoogleMap = Boolean(MAPS_API_KEY) && !quotaFallback;
  const fallbackDirectionsUrl =
    mapsUrl ||
    (customerCoords
      ? `https://www.google.com/maps/search/?api=1&query=${customerCoords.lat},${customerCoords.lng}`
      : tracking?.courierCoords
        ? `https://www.google.com/maps/search/?api=1&query=${tracking.courierCoords.lat},${tracking.courierCoords.lng}`
        : storeCoords
          ? `https://www.google.com/maps/search/?api=1&query=${storeCoords.lat},${storeCoords.lng}`
          : 'https://www.google.com/maps/search/?api=1&query=Gunung+Batin+Udik+Terusan+Nunyai+Lampung+Tengah');

  return (
    <div className="border border-zinc-200 rounded-xl overflow-hidden bg-white">
      {useInteractiveGoogleMap ? (
        <div className={`w-full ${heightClass} bg-zinc-100 relative`}>
          <APIProvider
            apiKey={MAPS_API_KEY}
            language="id"
            region="ID"
            libraries={['places', 'routes', 'marker']}
          >
            <MapsInnerLayer
              mapInstanceId={mapInstanceId}
              storeName={storeName}
              storeAddress={storeAddress}
              storeCoords={storeCoords}
              customerLabel={customerLabel}
              customerAddress={customerAddress}
              customerCoords={customerCoords}
              courierName={courierName}
              orderStatus={orderStatus}
              tracking={tracking}
              interactivePickTarget={interactivePickTarget}
              onPickCoords={onPickCoords}
              onFallbackTriggered={() => setQuotaFallback(true)}
            />
          </APIProvider>
        </div>
      ) : (
        <div
          className={`w-full ${heightClass} bg-[#F3F4F2] p-4 flex flex-col justify-between relative overflow-hidden`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#14532D] bg-white border border-zinc-200 rounded-md px-2.5 py-1">
              <Navigation className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Peta Rute Pengantaran Lokal</span>
            </span>

            <a
              href={fallbackDirectionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#14532D] hover:underline whitespace-nowrap"
            >
              <span>Buka di Google Maps</span>
              <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </a>
          </div>

          {/* Schematic route visualization Toko -> Kurir -> Pelanggan */}
          <div className="my-auto py-3 px-2">
            <div className="relative flex items-center justify-between">
              <div className="absolute left-6 right-6 top-5 h-1.5 bg-zinc-300 rounded-full" />
              <div
                className="absolute left-6 top-5 h-1.5 bg-[#14532D] rounded-full transition-all duration-300"
                style={{width: `calc(${Math.max(5, progress)}% - 3rem)`}}
              />

              {/* Toko Node */}
              <div className="relative z-10 flex flex-col items-center text-center w-24">
                <div className="w-10 h-10 rounded-full bg-[#14532D] text-white flex items-center justify-center shadow-sm border-2 border-white">
                  <Store className="w-4 h-4" aria-hidden="true" />
                </div>
                <p className="text-[11px] font-semibold text-zinc-900 mt-1.5 truncate w-full">
                  {storeName}
                </p>
                <p className="text-[10px] text-zinc-500 truncate w-full">Gang Makam</p>
              </div>

              {/* Moving Courier Node */}
              {orderStatus && (
                <div className="relative z-10 flex flex-col items-center text-center w-32">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shadow-sm border-2 border-white ${
                      hasArrived
                        ? 'bg-[#14532D] text-white'
                        : 'bg-amber-600 text-white'
                    }`}
                  >
                    <Truck className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <p className="text-[11px] font-bold text-zinc-900 mt-1.5 truncate w-full">
                    {hasArrived ? 'Sudah Tiba' : `Kurir (${progress}%)`}
                  </p>
                  <p className="text-[10px] text-zinc-600 truncate w-full">
                    {courierName || 'Kurir Toko'}
                  </p>
                </div>
              )}

              {/* Customer Node */}
              {customerAddress && (
                <div className="relative z-10 flex flex-col items-center text-center w-24">
                  <div className="w-10 h-10 rounded-full bg-blue-700 text-white flex items-center justify-center shadow-sm border-2 border-white">
                    <MapPin className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <p className="text-[11px] font-semibold text-zinc-900 mt-1.5 truncate w-full">
                    {customerLabel || 'Tujuan'}
                  </p>
                  <p className="text-[10px] text-zinc-500 truncate w-full">
                    {customerAddress}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-600 border-t border-zinc-200 pt-2">
            <span>
              {checkpointInfo
                ? checkpointInfo.label
                : storeAddress}
            </span>
            {(tracking?.courierCoords || customerCoords || storeCoords) && (
              <span className="font-mono text-[10px] text-zinc-500 tabular-price">
                GPS:{' '}
                {(tracking?.courierCoords || customerCoords || storeCoords)!.lat.toFixed(4)},{' '}
                {(tracking?.courierCoords || customerCoords || storeCoords)!.lng.toFixed(4)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Map legend & live coordinates footer */}
      <div className="px-3.5 py-2.5 bg-zinc-50 border-t border-zinc-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-600">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#14532D]" />
            <span>Toko Dimas Jaya</span>
          </span>
          {(orderStatus || tracking) && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-600" />
              <span>Posisi Kurir</span>
            </span>
          )}
          {customerAddress && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-700" />
              <span>Lokasi Pelanggan</span>
            </span>
          )}
        </div>

        <a
          href={fallbackDirectionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-[#14532D] hover:underline whitespace-nowrap"
        >
          <span>Buka Petunjuk Arah</span>
          <ExternalLink className="w-3 h-3" aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
