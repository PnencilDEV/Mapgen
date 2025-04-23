let worldMapData;
const cities = [];

// Initialize the map projection
const projection = d3.geoEquirectangular()
    .scale(155)
    .translate([500, 250]);

// Load world map data
fetch('https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson')
    .then(response => response.json())
    .then(data => {
        worldMapData = data;
        const path = d3.geoPath().projection(projection);
        document.getElementById('countries').setAttribute('d', path(data));
    });

// Handle equator toggle
document.getElementById('equatorToggle').addEventListener('change', function(e) {
    document.getElementById('equator').style.display = e.target.checked ? 'block' : 'none';
});

// Handle prime meridian toggle
document.getElementById('primeMeridianToggle').addEventListener('change', function(e) {
    document.getElementById('primeMeridian').style.display = e.target.checked ? 'block' : 'none';
});

// Handle color presets
document.querySelectorAll('.preset-color').forEach(button => {
    button.addEventListener('click', function() {
        const color = this.dataset.color;
        document.getElementById('pinColor').value = color;
        
        // Update active state
        document.querySelectorAll('.preset-color').forEach(btn => {
            btn.classList.remove('active');
        });
        this.classList.add('active');
    });
});

// Handle map export
document.getElementById('exportButton').addEventListener('click', async function() {
    const format = document.getElementById('exportFormat').value;
    const mapContainer = document.getElementById('map-container');
    
    try {
        const canvas = await html2canvas(mapContainer, {
            backgroundColor: '#f8f9fa',
            scale: 2, // Higher quality
        });
        
        // Create download link
        const link = document.createElement('a');
        link.download = `world-map.${format}`;
        link.href = canvas.toDataURL(`image/${format}`);
        link.click();
    } catch (error) {
        console.error('Error exporting map:', error);
        alert('Error exporting map. Please try again.');
    }
});

// Handle Enter key in single city input
document.getElementById('cityInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        addCity();
    }
});

// Handle Enter key in bulk input (allow new lines)
document.getElementById('bulkCityInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter' && e.shiftKey) {
        // Submit on Shift+Enter
        e.preventDefault();
        addBulkCities();
    }
});

// Function to convert color name to hex
function colorNameToHex(color) {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = color;
    return ctx.fillStyle;
}

// Function to parse city and color from input
function parseCityInput(input) {
    const parts = input.split('+').map(part => part.trim());
    if (parts.length === 2) {
        try {
            const color = colorNameToHex(parts[1]);
            return {
                cityName: parts[0],
                color: color
            };
        } catch (e) {
            return {
                cityName: parts[0],
                color: null
            };
        }
    }
    return {
        cityName: input.trim(),
        color: null
    };
}

// Function to add multiple cities
async function addBulkCities() {
    const bulkInput = document.getElementById('bulkCityInput');
    const entries = bulkInput.value.split('\n').filter(entry => entry.trim() !== '');
    const defaultColor = document.getElementById('pinColor').value;

    if (entries.length === 0) return;

    // Disable the button while processing
    const addButton = document.querySelector('.bulk-input button');
    addButton.disabled = true;
    addButton.textContent = 'Adding Cities...';

    try {
        // Process cities in sequence to avoid overwhelming the geocoding service
        for (const entry of entries) {
            const { cityName, color } = parseCityInput(entry);
            await addCityToMap(cityName, color || defaultColor);
            // Add a small delay between requests to be nice to the API
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // Clear the textarea after successful addition
        bulkInput.value = '';
    } catch (error) {
        console.error('Error adding cities:', error);
        alert('There was an error adding some cities. Please try again.');
    } finally {
        // Re-enable the button
        addButton.disabled = false;
        addButton.textContent = 'Add All Cities';
    }
}

// Function to check if two rectangles overlap
function checkOverlap(rect1, rect2) {
    return !(rect1.x + rect1.width < rect2.x ||
             rect2.x + rect2.width < rect1.x ||
             rect1.y + rect1.height < rect2.y ||
             rect2.y + rect2.height < rect1.y);
}

// Refactor the city addition logic into a reusable function
async function addCityToMap(cityName, pinColor) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}`);
        const data = await response.json();

        if (data.length > 0) {
            const { lat, lon } = data[0];
            const [x, y] = projection([lon, lat]);
            
            // Create pin group
            const pinGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
            document.getElementById('pins').appendChild(pinGroup);
            
            // Create text label first (we need it to calculate size)
            const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
            label.setAttribute("class", "pin-label");
            label.textContent = cityName;

            // Try positions (above and below) until we find one without overlap
            const positions = [
                { y: y - 10, align: 'bottom' }, // Above pin
                { y: y + 20, align: 'top' }     // Below pin
            ];

            let bestPosition = positions[0];
            let hasOverlap = false;

            // Get all existing label backgrounds
            const existingLabels = Array.from(document.querySelectorAll('.label-background')).map(rect => rect.getBBox());

            // Test each position
            for (const pos of positions) {
                label.setAttribute("x", x);
                label.setAttribute("y", pos.y);
                pinGroup.appendChild(label);
                
                const testBBox = label.getBBox();
                const padding = 4;
                const testRect = {
                    x: testBBox.x - padding,
                    y: testBBox.y - padding,
                    width: testBBox.width + (padding * 2),
                    height: testBBox.height + (padding * 2)
                };

                // Check for overlaps with existing labels
                hasOverlap = existingLabels.some(existing => checkOverlap(testRect, existing));
                
                if (!hasOverlap) {
                    bestPosition = pos;
                    break;
                }
            }

            // Position the label using the best position found
            label.setAttribute("x", x);
            label.setAttribute("y", bestPosition.y);
            
            const textBBox = label.getBBox();
            
            // Create and size background rectangle based on actual text size
            const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
            const padding = 4;
            background.setAttribute("x", textBBox.x - padding);
            background.setAttribute("y", textBBox.y - padding);
            background.setAttribute("width", textBBox.width + (padding * 2));
            background.setAttribute("height", textBBox.height + (padding * 2));
            background.setAttribute("fill", "white");
            background.setAttribute("rx", "4");
            background.setAttribute("class", "label-background");
            
            // Create pin circle
            const pin = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            pin.setAttribute("cx", x);
            pin.setAttribute("cy", y);
            pin.setAttribute("r", "5");
            pin.setAttribute("fill", pinColor);
            pin.setAttribute("stroke", "#fff");
            pin.setAttribute("stroke-width", "1");
            
            // Remove existing elements
            pinGroup.innerHTML = '';
            
            // Add all elements in correct order
            pinGroup.appendChild(background);
            pinGroup.appendChild(label);
            pinGroup.appendChild(pin);
            
            // Store city data
            cities.push({ name: cityName, lat, lon, color: pinColor });
            
            return true;
        }
        return false;
    } catch (error) {
        console.error(`Error adding city ${cityName}:`, error);
        return false;
    }
}

// Update the original addCity function to use the new shared function
async function addCity() {
    const cityInput = document.getElementById('cityInput');
    const cityName = cityInput.value;
    const pinColor = document.getElementById('pinColor').value;
    
    if (!cityName) return;
    
    const success = await addCityToMap(cityName, pinColor);
    if (success) {
        cityInput.value = '';
    } else {
        alert('City not found. Please try another city name.');
    }
}
