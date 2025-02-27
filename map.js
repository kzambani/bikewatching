// Import Mapbox as an ESM module
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
// Import D3 as an ES module
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

let timeFilter = -1;

// Check that Mapbox GL JS is loaded
console.log("Mapbox GL JS Loaded:", mapboxgl);

// Set your Mapbox access token here
mapboxgl.accessToken = 'pk.eyJ1Ijoia2F5emVlMDAwIiwiYSI6ImNtN21lMW5sNTBsZGsyam9pa3lpMTc4M3gifQ.INDaFGPhtPVHgDIPx70khg';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox:///mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18 // Maximum allowed zoom
});

function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);  // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point);  // Project to pixel coordinates
    return { cx: x, cy: y };  // Return as object for use in SVG attributes
  }

// Loading in data
map.on('load', async () => { 
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
      });
      
    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
      });

    // Visualize Boston routes
    map.addLayer({
        id: 'boston-bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
        'line-color': '#d4adef',
        'line-width': 5,
        'line-opacity': 0.6
        }
    });
    
    // Visualize Cambdridge routes
    map.addLayer({
        id: 'cambridge-bike-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: {
        'line-color': '#d4adef',
        'line-width': 5,
        'line-opacity': 0.6
        }
    });

    // Station data
    let jsonData;
    try {
        const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
        
        // Await JSON fetch
        jsonData = await d3.json(jsonurl);
        
        console.log('Loaded JSON Data:', jsonData); // Log to verify structure
    } catch (error) {
        console.error('Error loading JSON:', error); // Handle errors
    }

    // Bike traffic data
    let trips;
    try {
        const csvUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
        trips = await d3.csv(csvUrl,
          (trip) => {
            trip.started_at = new Date(trip.started_at);
            trip.ended_at = new Date(trip.ended_at);
            return trip;
          },
        );

        console.log('Loaded Traffic Data:', trips); // Log to check structure
    } catch (error) {
        console.error('Error loading traffic data:', error);
    }

    let stations = computeStationTraffic(jsonData.data.stations, trips);
    console.log('Stations Array:', stations);

    // Calculating traffic at each station
    const departures = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.start_station_id,
    );

    const arrivals = d3.rollup(
      trips,
      v => v.length,
      d => d.end_station_id
    );

    stations = stations.map(station => {
        let id = station.short_name; // Station ID from JSON matches trips
  
        station.arrivals = arrivals.get(id) ?? 0;    // Assign arrivals
        station.departures = departures.get(id) ?? 0; // Assign departures
        station.totalTraffic = station.arrivals + station.departures; // Compute total traffic
  
        return station;
    });

    console.log('Updated Stations with Traffic:', stations); // Verify traffic data

    // Station size based on traffic
    const radiusScale = d3
      .scaleSqrt()
      .domain([0, d3.max(stations, d => d.totalTraffic)])
      .range([0, 25])

    const svg = d3.select('#map').select('svg');

    let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

    // Append circles to the SVG for each station
    const circles = svg.selectAll('circle')
        .data(stations, (d) => d.short_name)  // Use station short_name as the key
        .enter()
        .append('circle')
        .attr('r', d => radiusScale(d.totalTraffic)) // Set radius based on traffic
        .attr('fill', d => {
          // Calculate the departure ratio
          const departureRatio = d.departures / d.totalTraffic;
          const ratio = stationFlow(departureRatio);
          
          // Use d3.interpolate to blend between arrival and departure colors
          return d3.interpolate('darkorange', 'steelblue')(ratio);
        })
        .attr('fill-opacity', 0.6) // Make overlapping circles clearer
        .attr('stroke', 'white')    // Circle border color
        .attr('stroke-width', 1)    // Circle border thickness
        .attr('opacity', 0.8)      // Circle opacity
        .attr('pointer-events', 'auto');  // Show tooltip

    // Create a legend
    const legend = svg.append('g')
    .attr('class', 'legend')
    .attr('transform', 'translate(20, 20)');

    // Add title
    legend.append('text')
    .attr('x', 0)
    .attr('y', 0)
    .text('Traffic Flow')
    .style('font-weight', 'bold');

    // Add color squares
    const legendItems = [
    { label: 'More Departures', color: 'steelblue' },
    { label: 'Balanced', color: d3.interpolate('darkorange', 'steelblue')(0.5) },
    { label: 'More Arrivals', color: 'darkorange' }
    ];

    legendItems.forEach((item, i) => {
    // Add color square
    legend.append('rect')
      .attr('x', 0)
      .attr('y', 15 + i * 20)
      .attr('width', 15)
      .attr('height', 15)
      .attr('fill', item.color);

    // Add label
    legend.append('text')
      .attr('x', 20)
      .attr('y', 27 + i * 20)
      .text(item.label)
      .style('font-size', '12px');
    });
      
    // Tooltip
    circles.each(function (d) {
      d3.select(this)
          .append('title') // Add a tooltip element
          .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
  });
  
    console.log('Updated circles with tooltips');
    
    // Function to update circle positions when the map moves/zooms
    function updatePositions() {
        circles
          .attr('cx', d => getCoords(d).cx)  // Set the x-position using projected coordinates
          .attr('cy', d => getCoords(d).cy); // Set the y-position using projected coordinates
      }
  
    // Initial position update when map loads
    updatePositions();

    // Reposition markers on map interactions
    map.on('move', updatePositions);     // Update during map movement
    map.on('zoom', updatePositions);     // Update during zooming
    map.on('resize', updatePositions);   // Update on window resize
    map.on('moveend', updatePositions);  // Final adjustment after movement ends

    // Slider
    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('selected-time');
    const anyTimeLabel = document.getElementById('any-time');

    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay();

    function updateTimeDisplay() {
      timeFilter = Number(timeSlider.value);  // Get slider value
    
      if (timeFilter === -1) {
        selectedTime.textContent = '';  // Clear time display
        anyTimeLabel.style.display = 'block';  // Show "(any time)"
      } else {
        selectedTime.textContent = formatTime(timeFilter);  // Display formatted time
        anyTimeLabel.style.display = 'none';  // Hide "(any time)"
      }
    
      updateScatterPlot(timeFilter);
    }

    function updateScatterPlot(timeFilter) {
      // Get only the trips that match the selected time filter
      const filteredTrips = filterTripsbyTime(trips, timeFilter);
      
      // Recompute station traffic based on the filtered trips
      const filteredStations = computeStationTraffic(stations, filteredTrips);

      timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);
      
      // Update the scatterplot by adjusting the radius of circles
      circles
        .data(filteredStations, (d) => d.short_name)  // Ensure D3 tracks elements correctly
        .join('circle') // Ensure the data is bound correctly
        .attr('r', (d) => radiusScale(d.totalTraffic)) // Update circle sizes
        .attr('fill', d => {
          // Calculate the departure ratio
          const departureRatio = d.departures / d.totalTraffic;
          const ratio = stationFlow(departureRatio);
          
          // blend between arrival and departure colors
          return d3.interpolate('darkorange', 'steelblue')(ratio);
        });
    }
  
  });

function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);  // Set hours & minutes
    return date.toLocaleString('en-US', { timeStyle: 'short' }); // Format as HH:MM AM/PM
  }

function computeStationTraffic(stations, trips) {
    // Compute departures
    const departures = d3.rollup(
        trips, 
        (v) => v.length, 
        (d) => d.start_station_id
    );

    // Compute arrivals
    const arrivals = d3.rollup(
      trips,
      v => v.length,
      d => d.end_station_id
    );
  
    // Update each station..
    return stations.map((station) => {
      let id = station.short_name;
      station.arrivals = arrivals.get(id) ?? 0;
      station.departures = departures.get(id) ?? 0;
      station.totalTraffic = station.arrivals + station.departures;
      
      return station;
  });
}

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function filterTripsbyTime(trips, timeFilter) {
  return timeFilter === -1 
    ? trips // If no filter is applied (-1), return all trips
    : trips.filter((trip) => {
        // Convert trip start and end times to minutes since midnight
        const startedMinutes = minutesSinceMidnight(trip.started_at);
        const endedMinutes = minutesSinceMidnight(trip.ended_at);
        
        // Include trips that started or ended within 60 minutes of the selected time
        return (
          Math.abs(startedMinutes - timeFilter) <= 60 ||
          Math.abs(endedMinutes - timeFilter) <= 60
        );
    });
}