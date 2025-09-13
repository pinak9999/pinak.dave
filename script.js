/* ===================================================================
JAVASCRIPT LOGIC
=================================================================== */

//---------------------------------------------------------
// Simulation of Blockchain and Smart Contracts
//---------------------------------------------------------
class Block {
    constructor(timestamp, data, previousHash = '') {
        this.timestamp = timestamp;
        this.data = data;
        this.previousHash = previousHash;
        this.hash = this.calculateHash();
    }

    calculateHash() {
        const str = this.previousHash + this.timestamp + JSON.stringify(this.data);
        return btoa(unescape(encodeURIComponent(str))).substr(0, 32);
    }
}

class Blockchain {
    constructor() {
        this.chain = [this.createGenesisBlock()];
        this.metadata = {}; // Master record of all herbs created
        this.inventories = { // Actor-specific inventories
            'SUPPLIER-001': {},
            'MANU-001': {}
        };
    }

    createGenesisBlock() {
        return new Block('2025-01-01', 'Genesis Block', '0');
    }

    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    addBlock(newBlock) {
        newBlock.previousHash = this.getLatestBlock().hash;
        newBlock.hash = newBlock.calculateHash();
        this.chain.push(newBlock);
    }

    // Smart Contracts
    registerHerb(collectorID, herbID, name, location, quantity, unitType, quality) {
        if (this.metadata[herbID]) {
            return { success: false, message: 'This herb ID already exists.' };
        }
        const data = { type: 'registerHerb', collectorID, herbID, name, location, quantity, unitType, quality, timestamp: Date.now() };
        this.addBlock(new Block(data.timestamp, data));
        
        this.metadata[herbID] = { name, location, quality, history: [data] };
        
        this.inventories['SUPPLIER-001'][herbID] = {
            name,
            quantity: parseFloat(quantity),
            unitType
        };

        return { success: true, message: `Herb ID ${herbID} successfully recorded.` };
    }

    transferHerb(fromID, toID, herbID, weight, location, unitType, supplierQuality) {
        const masterHerb = this.metadata[herbID];
        if (!masterHerb) {
            return { success: false, message: 'Herb ID does not exist in master record.' };
        }

        const supplierInventory = this.inventories[fromID];
        const supplierHerb = supplierInventory ? supplierInventory[herbID] : undefined;

        if (!supplierHerb) {
            return { success: false, message: `Herb ID ${herbID} not found in supplier's inventory.` };
        }
        
        if (supplierHerb.unitType !== unitType) {
            return { success: false, message: `Unit mismatch. Expected ${supplierHerb.unitType} but got ${unitType}.`};
        }

        const availableQuantity = supplierHerb.quantity;
        const transferWeight = parseFloat(weight);

        if (transferWeight > availableQuantity) {
            return { success: false, message: `Insufficient units. Available: ${availableQuantity.toFixed(2)} ${supplierHerb.unitType}, Requested: ${transferWeight.toFixed(2)} ${unitType}.` };
        }

        if (supplierQuality.score < 70) {
            return { success: false, message: `QUALITY BLOCKED! Supplier's score is too low: ${supplierQuality.score}/100. Transfer denied.` };
        }

        supplierHerb.quantity -= transferWeight;
        
        if (!this.inventories[toID]) {
            this.inventories[toID] = {};
        }
        if (!this.inventories[toID][herbID]) {
            this.inventories[toID][herbID] = {
                name: masterHerb.name,
                quantity: 0,
                unitType: supplierHerb.unitType
            };
        }
        this.inventories[toID][herbID].quantity += transferWeight;

        const data = {
            type: 'transferHerb',
            fromID,
            toID,
            herbID,
            weight: transferWeight,
            unitType,
            location,
            supplierQuality,
            timestamp: Date.now()
        };
        this.addBlock(new Block(data.timestamp, data));
        masterHerb.history.push(data);
        
        return { success: true, message: `${transferWeight.toFixed(2)} ${unitType} of ${masterHerb.name} successfully transferred.` };
    }
    
    useHerbInMedicine(batchID, manufacturerID, location, usedBatches, finalWeight, finalUnit, manufacturerQuality) {
        const invalidHerbs = [];
        
        if (manufacturerQuality.score < 60) {
            return { success: false, message: `QUALITY BLOCKED! Manufacturer's score is too low: ${manufacturerQuality.score}/100. Production denied.` };
        }
        
        const manufacturerInventory = this.inventories[manufacturerID];
        if (!manufacturerInventory) {
            return { success: false, message: "Manufacturer not found."};
        }

        for (const batch of usedBatches) {
            const id = batch.herbID;
            const unitsUsed = parseFloat(batch.unitsUsed);
            const herbInManuInventory = manufacturerInventory[id];

            if (!herbInManuInventory || herbInManuInventory.quantity < unitsUsed) {
                invalidHerbs.push(`${id} (Available: ${herbInManuInventory ? herbInManuInventory.quantity.toFixed(2) : 0} ${herbInManuInventory.unitType})`);
                continue;
            }
             if (herbInManuInventory.unitType !== batch.unitType) {
                invalidHerbs.push(`${id} (Unit Mismatch: Expected ${herbInManuInventory.unitType})`);
                continue;
            }
        }

        if (invalidHerbs.length > 0) {
            return { success: false, message: `Error with used herbs: ${invalidHerbs.join(', ')}` };
        }

        const data = { type: 'useHerb', manufacturerID, batchID, location, usedBatches, finalWeight, finalUnit, manufacturerQuality, timestamp: Date.now() };
        this.addBlock(new Block(data.timestamp, data));

        usedBatches.forEach(batch => {
            const herb = this.inventories[manufacturerID][batch.herbID];
            if (herb) {
                herb.quantity -= parseFloat(batch.unitsUsed);
                this.metadata[batch.herbID].history.push(data);
            }
        });

        return { success: true, message: `Batch ${batchID} successfully recorded.` };
    }
}

//---------------------------------------------------------
// DOM ELEMENTS AND EVENT LISTENERS
//---------------------------------------------------------
const herbChain = new Blockchain();
const tabs = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');
const ledgerBody = document.getElementById('ledger-body');
const qrcodeDiv = document.getElementById('qrcode');
const qrTitle = document.getElementById('qr-title');
const generatedQrCount = document.getElementById('generated-qr-count');
const downloadPdfBtn = document.getElementById('download-pdf-btn');
const multiBatchInputsContainer = document.getElementById('multi-batch-inputs');
const addBatchBtn = document.getElementById('add-batch-btn');
const transferHerbSelect = document.getElementById('transfer-herb-id');
const availableUnitsSupplierSpan = document.getElementById('available-units-supplier');

const MAX_BATCHES = 5;

const qrImageInput = document.getElementById('qr-image-input');
const traceResultDiv = document.getElementById('trace-result');
const traceContent = document.getElementById('trace-content');

let collectorQualityData = null;
let supplierQualityData = null;
let manufacturerQualityData = null;

let collectorStream = null;
let supplierStream = null;
let manufacturerStream = null;

const GOOGLE_MAPS_API_KEY = "YOUR_API_KEY_HERE";

async function fetchAddressFromCoordinates(lat, lon, statusDiv) {
    if(GOOGLE_MAPS_API_KEY === "YOUR_API_KEY_HERE") {
        statusDiv.textContent = 'API कुंजी के बिना विस्तृत पता प्राप्त नहीं किया जा सकता।';
        statusDiv.className = 'status-message error';
        return `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
    }
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=${GOOGLE_MAPS_API_KEY}`;
    statusDiv.textContent = 'पता प्राप्त किया जा रहा है...';
    statusDiv.className = 'status-message warning';
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.status === 'OK' && data.results.length > 0) {
            const address = data.results[0].formatted_address;
            statusDiv.textContent = 'लोकेशन सफलतापूर्वक पता लगाई गई।';
            statusDiv.className = 'status-message success';
            return address;
        } else {
            statusDiv.textContent = 'पता नहीं मिला।';
            statusDiv.className = 'status-message warning';
            return `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
        }
    } catch (error) {
        statusDiv.textContent = `पता प्राप्त करने में त्रुटि: ${error.message}`;
        statusDiv.className = 'status-message error';
        console.error("Geocoding API error:", error);
        return `Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}`;
    }
}

function simpleHash(imageData) {
    let hash = 0;
    for (let i = 0; i < imageData.length; i++) {
        hash = ((hash << 5) - hash) + imageData[i];
        hash |= 0;
    }
    const score = (Math.abs(hash) % 51) + 50;
    return score;
}

function getGeoLocation(role) {
    const locationInput = document.getElementById(`${role}-location`);
    const statusDiv = document.getElementById(`${role}-status`);
    if (navigator.geolocation) {
        statusDiv.textContent = 'लोकेशन पता लगाई जा रही है...';
        statusDiv.className = 'status-message warning';
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lon = position.coords.longitude;
                fetchAddressFromCoordinates(lat, lon, statusDiv)
                    .then(address => { locationInput.value = address; })
                    .catch(error => { console.error("Geocoding failed:", error); });
            },
            (error) => {
                let errorMessage;
                switch(error.code) {
                    case error.PERMISSION_DENIED: errorMessage = "उपयोगकर्ता ने लोकेशन की अनुमति नहीं दी।"; break;
                    case error.POSITION_UNAVAILABLE: errorMessage = "लोकेशन की जानकारी उपलब्ध नहीं है।"; break;
                    case error.TIMEOUT: errorMessage = "लोकेशन पता लगाने का अनुरोध समय समाप्त हो गया।"; break;
                    default: errorMessage = "एक अज्ञात त्रुटि हुई।";
                }
                statusDiv.textContent = `त्रुटि: ${errorMessage}`;
                statusDiv.className = 'status-message error';
            }
        );
    } else {
        statusDiv.textContent = 'आपके ब्राउज़र में जियोलोकेशन समर्थित नहीं है।';
        statusDiv.className = 'status-message error';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const initialTab = document.querySelector('.tab-button.active');
    if (initialTab) {
        initialTab.classList.add('active');
        const contentId = initialTab.getAttribute('data-tab');
        document.getElementById(contentId).classList.add('active');
    }
    updateLedger();
    updateSupplierForm();
    updateManufacturerForm();
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark-mode');
    }
});

tabs.forEach(button => {
    button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        tabs.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        tabContents.forEach(content => content.classList.remove('active'));
        document.getElementById(tab).classList.add('active');
        stopAllCameras();
        
        document.getElementById('collector-status').innerHTML = '';
        document.getElementById('supplier-status').innerHTML = '';
        document.getElementById('manufacturer-status').innerHTML = '';
    });
});

function stopAllCameras() {
    stopCamera('collector');
    stopCamera('supplier');
    stopCamera('manufacturer');
}

function startCamera(role) {
    const video = document.getElementById(`${role}-camera-preview`);
    const startBtn = document.getElementById(`start-${role}-camera-btn`);
    const checkBtn = document.getElementById(`check-${role}-quality-btn`);
    const stopBtn = document.getElementById(`stop-${role}-camera-btn`);
    const statusDiv = document.getElementById(`${role}-quality-result`);

    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        statusDiv.textContent = 'Starting camera...';
        statusDiv.className = 'status-message warning';
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(function(stream) {
                video.srcObject = stream;
                video.style.display = 'block';
                video.play();
                startBtn.style.display = 'none';
                checkBtn.style.display = 'inline-block';
                stopBtn.style.display = 'inline-block';
                statusDiv.textContent = 'Camera started. Frame the herb and take a snapshot.';
                statusDiv.className = 'status-message success';
                window[`${role}Stream`] = stream;
            })
            .catch(function(err) {
                statusDiv.textContent = `Camera access denied: ${err.name}`;
                statusDiv.className = 'status-message error';
                console.error("Camera access error: ", err);
            });
    } else {
        statusDiv.textContent = 'Camera not supported by your browser.';
        statusDiv.className = 'status-message error';
    }
}

function stopCamera(role) {
    const video = document.getElementById(`${role}-camera-preview`);
    const startBtn = document.getElementById(`start-${role}-camera-btn`);
    const checkBtn = document.getElementById(`check-${role}-quality-btn`);
    const stopBtn = document.getElementById(`stop-${role}-camera-btn`);
    const stream = window[`${role}Stream`];

    if (stream) {
        stream.getTracks().forEach(track => track.stop());
    }

    video.srcObject = null;
    video.style.display = 'none';
    startBtn.style.display = 'inline-block';
    checkBtn.style.display = 'none';
    stopBtn.style.display = 'none';
    window[`${role}Stream`] = null;
}

function takeSnapshotAndCheck(role) {
    const video = document.getElementById(`${role}-camera-preview`);
    const canvas = document.getElementById(`${role}-canvas`);
    const statusDiv = document.getElementById(`${role}-quality-result`);

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height).data;

    statusDiv.textContent = 'Analyzing snapshot for herb quality...';
    statusDiv.className = 'status-message';

    setTimeout(() => {
        const qualityScore = simpleHash(imageData);
        let qualityStatus, statusClass;
        let qualityData = { score: qualityScore };

        let threshold = 50;
        if (role === 'supplier') threshold = 70;
        else if (role === 'manufacturer') threshold = 60;

        if (qualityScore < threshold) {
            qualityStatus = `Check Failed! Score is too low.`;
            statusClass = "error";
        } else if (qualityScore >= 90) {
            qualityStatus = "Excellent";
            statusClass = "success";
        } else {
            qualityStatus = "Passed";
            statusClass = "warning";
        }

        qualityData.status = qualityStatus;

        if (role === 'collector') collectorQualityData = qualityData;
        if (role === 'supplier') supplierQualityData = qualityData;
        if (role === 'manufacturer') manufacturerQualityData = qualityData;

        statusDiv.textContent = `AI analysis complete! Quality Score: ${qualityScore}/100. Status: ${qualityStatus}`;
        statusDiv.className = `status-message ${statusClass}`;
    }, 1000);
}

document.getElementById('capture-collector-location-btn').addEventListener('click', () => getGeoLocation('collector'));
document.getElementById('capture-supplier-location-btn').addEventListener('click', () => getGeoLocation('supplier'));
document.getElementById('capture-manufacturer-location-btn').addEventListener('click', () => getGeoLocation('manufacturer'));

document.getElementById('start-collector-camera-btn').addEventListener('click', () => startCamera('collector'));
document.getElementById('check-collector-quality-btn').addEventListener('click', () => takeSnapshotAndCheck('collector'));
document.getElementById('stop-collector-camera-btn').addEventListener('click', () => stopCamera('collector'));

document.getElementById('start-supplier-camera-btn').addEventListener('click', () => startCamera('supplier'));
document.getElementById('check-supplier-quality-btn').addEventListener('click', () => takeSnapshotAndCheck('supplier'));
document.getElementById('stop-supplier-camera-btn').addEventListener('click', () => stopCamera('supplier'));

document.getElementById('start-manufacturer-camera-btn').addEventListener('click', () => startCamera('manufacturer'));
document.getElementById('check-manufacturer-quality-btn').addEventListener('click', () => takeSnapshotAndCheck('manufacturer'));
document.getElementById('stop-manufacturer-camera-btn').addEventListener('click', () => stopCamera('manufacturer'));

function updateSupplierForm() {
    const supplierInventory = herbChain.inventories['SUPPLIER-001'];
    const availableHerbs = Object.entries(supplierInventory)
        .filter(([id, data]) => data.quantity > 0);

    const selectElement = document.getElementById('transfer-herb-id');
    selectElement.innerHTML = '<option value="">Select a collected herb...</option>';

    if (availableHerbs.length > 0) {
        availableHerbs.forEach(([id, data]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = `${data.name} (ID: ${id.substring(5, 12)}... - ${data.quantity.toFixed(2)} ${data.unitType})`;
            selectElement.appendChild(option);
        });
    } else {
        selectElement.innerHTML = '<option value="">No collected herbs available</option>';
    }
    
    availableUnitsSupplierSpan.textContent = '';
}

transferHerbSelect.addEventListener('change', (e) => {
    const selectedHerbId = e.target.value;
    if (selectedHerbId) {
        const herbData = herbChain.inventories['SUPPLIER-001'][selectedHerbId];
        availableUnitsSupplierSpan.textContent = `(Available: ${herbData.quantity.toFixed(2)} ${herbData.unitType})`;
        document.getElementById('supplier-unit-select').value = herbData.unitType;
    } else {
        availableUnitsSupplierSpan.textContent = '';
    }
});

function updateManufacturerForm() {
    const manufacturerInventory = herbChain.inventories['MANU-001'];
    const transferredHerbs = Object.entries(manufacturerInventory)
        .filter(([id, data]) => data.quantity > 0);

    if (transferredHerbs.length > 0) {
        addBatchBtn.style.display = 'block';
        addBatchBtn.textContent = 'Add Herb Batch';
        addBatchBtn.disabled = false;
        addBatchBtn.classList.remove('disabled');
    } else {
        addBatchBtn.style.display = 'block';
        addBatchBtn.textContent = 'No Batches Available';
        addBatchBtn.disabled = true;
        addBatchBtn.classList.add('disabled');
    }

    const currentBatches = multiBatchInputsContainer.querySelectorAll('.batch-input-group').length;
    if (currentBatches >= MAX_BATCHES) {
        addBatchBtn.textContent = `Maximum ${MAX_BATCHES} Batches`;
        addBatchBtn.disabled = true;
        addBatchBtn.classList.add('disabled');
    }
}

addBatchBtn.addEventListener('click', () => {
    const currentBatches = multiBatchInputsContainer.querySelectorAll('.batch-input-group').length;
    if (currentBatches >= MAX_BATCHES) {
        alert(`You can only add up to ${MAX_BATCHES} herb batches.`);
        return;
    }

    const availableHerbs = Object.entries(herbChain.inventories['MANU-001'])
        .filter(([id, data]) => data.quantity > 0);

    if (availableHerbs.length === 0) {
        alert('No transferred herbs with available quantity to add.');
        return;
    }

    const newBatchInputGroup = document.createElement('div');
    newBatchInputGroup.className = 'batch-input-group';

    newBatchInputGroup.innerHTML = `
        <div>
            <label>Herb Batch:</label>
            <select class="used-herb-ids-select" required></select>
        </div>
        <div>
            <label>Units Used:</label>
            <div class="unit-input-group">
                <input type="number" class="units-used-input" placeholder="0" required>
                <select class="units-used-select">
                    <option value="Kg">Kg</option>
                    <option value="Gram">Gram</option>
                    <option value="Pieces">Pieces</option>
                    <option value="Bundles">Bundles</option>
                </select>
            </div>
            <span class="available-units-label"></span>
            <button type="button" class="remove-batch-btn">&times;</button>
        </div>
    `;

    const selectElement = newBatchInputGroup.querySelector('.used-herb-ids-select');
    const availableUnitsLabel = newBatchInputGroup.querySelector('.available-units-label');
    const removeBtn = newBatchInputGroup.querySelector('.remove-batch-btn');
    const unitSelect = newBatchInputGroup.querySelector('.units-used-select');

    selectElement.innerHTML = '<option value="">Select a batch...</option>';
    availableHerbs.forEach(([id, data]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = `${data.name} (ID: ${id.substring(5, 12)}... - ${data.quantity.toFixed(2)} ${data.unitType})`;
        selectElement.appendChild(option);
    });

    selectElement.addEventListener('change', (e) => {
        const selectedHerbId = e.target.value;
        if (selectedHerbId) {
            const herbData = herbChain.inventories['MANU-001'][selectedHerbId];
            availableUnitsLabel.textContent = `(Max: ${herbData.quantity.toFixed(2)} ${herbData.unitType})`;
            unitSelect.value = herbData.unitType;
        } else {
            availableUnitsLabel.textContent = '';
        }
    });

    removeBtn.addEventListener('click', () => {
        multiBatchInputsContainer.removeChild(newBatchInputGroup);
        updateManufacturerForm();
    });

    multiBatchInputsContainer.appendChild(newBatchInputGroup);
    updateManufacturerForm();
});

function updateLedger() {
    if (herbChain.chain.length <= 1) {
        ledgerBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--accent-color);">No transactions yet.</td></tr>';
        return;
    }
    ledgerBody.innerHTML = '';
    herbChain.chain.slice(1).reverse().forEach((block, index) => {
        const data = block.data;
        let weightMatchStatus = 'N/A';
        let qualityMatchStatus = 'N/A';
        
        if (data.type === 'transferHerb') {
            if (data.supplierQuality) {
                qualityMatchStatus = data.supplierQuality.score >= 70 ? '✅ Passed (>=70)' : `🚨 Failed (<70)`;
            }
        } else if (data.type === 'useHerb') {
            if (data.manufacturerQuality) {
                qualityMatchStatus = data.manufacturerQuality.score >= 60 ? '✅ Passed (>=60)' : `🚨 Failed (<60)`;
            }
        }

        let formattedData = '';
        for (const key in data) {
            if (data.hasOwnProperty(key)) {
                let value = data[key];
                if (typeof value === 'object' && value !== null) {
                    if (key === 'usedBatches') {
                        formattedData += `<strong>usedBatches:</strong><br>`;
                        value.forEach(batch => {
                            formattedData += `&nbsp;&nbsp; - Herb ID: ${batch.herbID.substring(0, 15)}...<br>`;
                            formattedData += `&nbsp;&nbsp; - Units Used: ${batch.unitsUsed} ${batch.unitType}<br>`;
                        });
                    } else {
                        value = JSON.stringify(value, null, 2);
                        formattedData += `<strong>${key}:</strong> ${value}<br>`;
                    }
                } else {
                    formattedData += `<strong>${key}:</strong> ${value}<br>`;
                }
            }
        }

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${herbChain.chain.length - 1 - index}</td>
            <td>${block.previousHash.substring(0, 10)}...</td>
            <td>${block.hash.substring(0, 10)}...</td>
            <td>
                <details>
                    <summary class="data-summary">Show Details</summary>
                    <pre>${formattedData}</pre>
                </details>
            </td>
            <td>${weightMatchStatus}</td>
            <td>${qualityMatchStatus}</td>
        `;
        ledgerBody.appendChild(row);
    });
}

document.getElementById('add-herb-btn').addEventListener('click', () => {
    const name = document.getElementById('collector-herb-name').value;
    const location = document.getElementById('collector-location').value;
    const quantity = parseFloat(document.getElementById('collector-quantity').value);
    const unitType = document.getElementById('collector-unit-select').value;
    const statusDiv = document.getElementById('collector-status');

    if (!name || !location || isNaN(quantity) || quantity <= 0) {
        statusDiv.textContent = 'Please fill all fields correctly.';
        statusDiv.className = 'status-message error';
        return;
    }

    if (!collectorQualityData) {
        statusDiv.textContent = 'Please run the AI Quality Check first.';
        statusDiv.className = 'status-message error';
        return;
    }

    const herbID = 'HERB-' + Date.now();
    const result = herbChain.registerHerb('COLLECTOR-001', herbID, name, location, quantity, unitType, collectorQualityData);
    if (result.success) {
        statusDiv.textContent = result.message;
        statusDiv.className = 'status-message success';
        document.getElementById('collector-herb-name').value = '';
        document.getElementById('collector-location').value = '';
        document.getElementById('collector-quantity').value = '';
        document.getElementById('collector-quality-result').textContent = '';
        collectorQualityData = null;
        updateLedger();
        updateSupplierForm();
        updateManufacturerForm();
    } else {
        statusDiv.textContent = result.message;
        statusDiv.className = 'status-message error';
    }
});

document.getElementById('transfer-herb-btn').addEventListener('click', () => {
    const herbID = document.getElementById('transfer-herb-id').value;
    const toID = document.getElementById('transfer-to').value;
    const weight = document.getElementById('supplier-weight').value;
    const location = document.getElementById('supplier-location').value;
    const unitType = document.getElementById('supplier-unit-select').value;
    const statusDiv = document.getElementById('supplier-status');

    if (!herbID || !toID || !weight || !location) {
        statusDiv.textContent = 'Please fill all fields, including location.';
        statusDiv.className = 'status-message error';
        return;
    }

    if (!supplierQualityData) {
        statusDiv.textContent = 'Please run the AI Quality Check first.';
        statusDiv.className = 'status-message error';
        return;
    }

    const result = herbChain.transferHerb('SUPPLIER-001', toID, herbID, weight, location, unitType, supplierQualityData);
    if (result.success) {
        statusDiv.textContent = result.message;
        statusDiv.className = 'status-message success';
        document.getElementById('transfer-herb-id').value = '';
        document.getElementById('transfer-to').value = '';
        document.getElementById('supplier-weight').value = '';
        document.getElementById('supplier-location').value = '';
        document.getElementById('supplier-quality-result').textContent = '';
        availableUnitsSupplierSpan.textContent = '';
        supplierQualityData = null;
    } else {
        statusDiv.textContent = result.message;
        statusDiv.className = 'status-message error';
    }
    updateLedger();
    updateSupplierForm();
    updateManufacturerForm();
});

document.getElementById('produce-medicine-btn').addEventListener('click', () => {
    const batchID = document.getElementById('batch-id').value;
    const location = document.getElementById('manufacturer-location').value;
    const finalWeight = parseFloat(document.getElementById('final-medicine-units').value);
    const finalUnit = document.getElementById('final-medicine-unit-select').value;
    const statusDiv = document.getElementById('manufacturer-status');
    const multiBatchInputs = document.querySelectorAll('.batch-input-group');

    const usedBatches = [];
    let isValid = true;
    multiBatchInputs.forEach(group => {
        const select = group.querySelector('.used-herb-ids-select');
        const input = group.querySelector('.units-used-input');
        const unitSelect = group.querySelector('.units-used-select');
        const herbID = select.value;
        const unitsUsed = parseFloat(input.value);
        const unitType = unitSelect.value;

        if (!herbID || isNaN(unitsUsed) || unitsUsed <= 0) {
            isValid = false;
            statusDiv.textContent = 'Please fill all herb batch fields with positive numbers.';
            statusDiv.className = 'status-message error';
            return;
        }
        usedBatches.push({ herbID, unitsUsed, unitType });
    });

    if (!batchID || !location || isNaN(finalWeight) || finalWeight <= 0 || !isValid || usedBatches.length === 0) {
        if (isValid) {
            statusDiv.textContent = 'Please fill all fields, including location, and add at least one valid herb batch.';
            statusDiv.className = 'status-message error';
        }
        return;
    }

    if (!manufacturerQualityData) {
        statusDiv.textContent = 'Please run the AI Quality Check first.';
        statusDiv.className = 'status-message error';
        return;
    }

    const result = herbChain.useHerbInMedicine(batchID, 'MANU-001', location, usedBatches, finalWeight, finalUnit, manufacturerQualityData);

    if (result.success) {
        qrcodeDiv.innerHTML = '';
        qrTitle.style.display = 'block';
        const qrCodeCount = Math.floor(finalWeight);
        generatedQrCount.textContent = `Generating ${qrCodeCount} QR codes...`;

        for (let i = 1; i <= qrCodeCount; i++) {
            const qrData = JSON.stringify({
                batchID: batchID,
                unitID: `${batchID}-${String(i).padStart(3, '0')}`,
                type: 'medicine',
                sourceHerbs: usedBatches,
                producedOn: new Date().toISOString().split('T')[0]
            });
            
            const qrContainer = document.createElement('div');
            qrContainer.className = 'qr-code-item';

            const qrElement = document.createElement('div');
            new QRCode(qrElement, {
                text: qrData,
                width: 250,
                height: 250,
                correctLevel : QRCode.CorrectLevel.H
            });
            qrContainer.appendChild(qrElement);

            const qrLabel = document.createElement('p');
            qrLabel.textContent = `Unit ${i}`;
            qrLabel.style.fontSize = '0.8em';
            qrContainer.appendChild(qrLabel);
            
            const downloadBtn = document.createElement('button');
            downloadBtn.textContent = 'Download';
            downloadBtn.className = 'btn download-qr-btn';
            downloadBtn.onclick = function() {
                const qrImg = qrElement.querySelector('img');
                const a = document.createElement('a');
                a.href = qrImg.src;
                a.download = `QR_Batch-${batchID}_Unit-${i}.png`;
                a.click();
            };
            qrContainer.appendChild(downloadBtn);

            qrcodeDiv.appendChild(qrContainer);
        }

        statusDiv.textContent = result.message;
        statusDiv.className = 'status-message success';
        generatedQrCount.textContent = `Successfully generated ${qrCodeCount} unique QR codes.`;
        
        multiBatchInputsContainer.innerHTML = ''; 
        document.getElementById('batch-id').value = '';
        document.getElementById('manufacturer-location').value = '';
        document.getElementById('final-medicine-units').value = '';
        document.getElementById('manufacturer-quality-result').textContent = '';
        manufacturerQualityData = null;

        updateLedger();
        updateSupplierForm();
        updateManufacturerForm();
    } else {
        statusDiv.textContent = result.message;
        statusDiv.className = 'status-message error';
        generatedQrCount.textContent = '';
    }
});

// --- Consumer Tab Logic ---
function handleQrImageUpload(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }
    const html5QrCode = new Html5Qrcode("file-scanner-container");
    
    traceResultDiv.classList.remove('hidden');
    traceContent.innerHTML = '<p>Scanning image...</p>';

    html5QrCode.scanFile(file, true)
        .then(decodedText => {
            console.log(`File scan success: ${decodedText}`);
            processQrData(decodedText);
        })
        .catch(err => {
            console.error(`Error scanning file:`, err);
            traceResultDiv.classList.remove('hidden');
            traceContent.innerHTML = `<p class="status-message error">Error scanning image: ${err}. Please try a clearer QR code image.</p>`;
        })
        .finally(() => {
            qrImageInput.value = ''; 
        });
}

function processQrData(qrDataString) {
    let qrData;
    traceResultDiv.classList.remove('hidden');
    try {
        qrData = JSON.parse(qrDataString);
    } catch (e) {
        console.error("Failed to parse JSON from QR code.", e);
        console.log("Scanned string that failed to parse:", qrDataString);
        traceContent.innerHTML = `
            <p class="status-message error">
                QR Code was scanned, but the data inside is not in the correct format.
            </p>
            <p><strong>Scanned Data:</strong></p>
            <pre style="white-space: pre-wrap; word-wrap: break-word; text-align: left; background: #eee; color: #333; padding: 10px; border-radius: 5px;">${qrDataString}</pre>
        `;
        return;
    }

    if (qrData.type === 'medicine' && qrData.batchID) {
        let html = `<h4>Medicine Batch Details</h4>
                    <p><strong>Batch ID:</strong> ${qrData.batchID}</p>
                    <p><strong>Unit ID:</strong> ${qrData.unitID}</p>
                    <p><strong>Produced On:</strong> ${qrData.producedOn}</p>`;

        const useBlock = herbChain.chain.find(block => block.data.batchID === qrData.batchID && block.data.type === 'useHerb');
        
        if(useBlock) {
             html += `<p><strong>Production Location:</strong> ${useBlock.data.location || 'N/A'}</p>`;
        }

        if (useBlock && useBlock.data.usedBatches) {
            html += '<h4>Source Herb Batches:</h4>';
            useBlock.data.usedBatches.forEach(batch => {
                const herbMaster = herbChain.metadata[batch.herbID];
                if (herbMaster) {
                    html += `<div class="history-item">
                                <p><strong>Herb Name:</strong> ${herbMaster.name}</p>
                                <p><strong>Herb ID:</strong> ${batch.herbID}</p>
                                <p><strong>Units Used in this Batch:</strong> ${batch.unitsUsed} ${batch.unitType}</p>
                                <hr>`;
                    
                    herbMaster.history.forEach(rec => {
                         html += `<p><strong>Action:</strong> ${rec.type}<br>
                                  <strong>Timestamp:</strong> ${new Date(rec.timestamp).toLocaleString()}<br>
                                  <strong>Location:</strong> ${rec.location || 'N/A'}</p>`;
                    });
                     html += `</div>`;
                }
            });
        } else {
            html += '<p>No herb records found for this batch in the ledger.</p>';
        }
        traceContent.innerHTML = html;
    } else {
        traceContent.innerHTML = '<p class="status-message error">Invalid QR Code. Not a valid medicine QR code.</p>';
    }
}


// PDF Download Function
downloadPdfBtn.addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    doc.setFontSize(20);
    doc.text("HerbalChain Blockchain Ledger", 10, 15);
    doc.setFontSize(10);
    doc.text(`Report Generated: ${new Date().toLocaleString()}`, 10, 22);

    const tableData = [];
    const headers = ['Block ID', 'Previous Hash', 'Current Hash', 'Data', 'Weight Match', 'Quality Match'];

    herbChain.chain.slice(1).reverse().forEach((block, index) => {
        const data = block.data;
        const formattedData = Object.entries(data).map(([key, value]) => {
            let formattedValue = value;
            if (typeof value === 'object' && value !== null) {
                if (key === 'usedBatches') {
                    let batchString = 'usedBatches:\n';
                    value.forEach(batch => {
                        batchString += '  - Herb ID: ' + batch.herbID + '\n';
                        batchString += `  - Units Used: ${batch.unitsUsed} ${batch.unitType}\n`;
                    });
                    formattedValue = batchString;
                } else {
                    formattedValue = JSON.stringify(value, null, 2).replace(/\"/g, '');
                }
            }
            return `${key}: ${formattedValue}`;
        }).join('\n');

        let weightMatchStatus = 'N/A';
        let qualityMatchStatus = 'N/A';

        if (data.type === 'transferHerb' && data.herbID) {
            if (data.supplierQuality) {
                qualityMatchStatus = data.supplierQuality.score >= 70 ? 'Passed (>=70)' : `Failed (<70)`;
            }
        } else if (data.type === 'useHerb' && data.batchID) {
            if (data.manufacturerQuality) {
                qualityMatchStatus = data.manufacturerQuality.score >= 60 ? 'Passed (>=60)' : `Failed (<60)`;
            }
        }

        tableData.push([
            herbChain.chain.length - 1 - index,
            block.previousHash.substring(0, 10) + '...',
            block.hash.substring(0, 10) + '...',
            formattedData,
            weightMatchStatus,
            qualityMatchStatus
        ]);
    });

    doc.autoTable({
        startY: 30,
        head: [headers],
        body: tableData,
        theme: 'striped',
        styles: {
            fontSize: 8, cellPadding: 2, valign: 'middle', overflow: 'linebreak', cellWidth: 'wrap'
        },
        columnStyles: {
            0: { cellWidth: 15 }, 1: { cellWidth: 20 }, 2: { cellWidth: 20 },
            3: { cellWidth: 85 }, 4: { cellWidth: 25 }, 5: { cellWidth: 25 }
        },
    });

    doc.save('HerbalChain_Ledger.pdf');
});

// Theme Toggle Logic
document.getElementById('theme-toggle').addEventListener('click', () => {
    const body = document.documentElement;
    body.classList.toggle('dark-mode');
    const isDarkMode = body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
});

// Language Toggle Logic (Placeholder)
document.getElementById('language-toggle').addEventListener('click', () => {
    alert('Language selection feature coming soon!');
});

document.getElementById('capture-collector-location-btn').addEventListener('click', () => getGeoLocation('collector'));
document.getElementById('capture-supplier-location-btn').addEventListener('click', () => getGeoLocation('supplier'));
document.getElementById('capture-manufacturer-location-btn').addEventListener('click', () => getGeoLocation('manufacturer'));

qrImageInput.addEventListener('change', handleQrImageUpload);