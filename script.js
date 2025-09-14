/* ===================================================================
JAVASCRIPT LOGIC
=================================================================== */
//---------------------------------------------------------
// Blockchain and Smart Contracts Simulation
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
        // Using btoa for a simple, non-cryptographic hash simulation
        return btoa(unescape(encodeURIComponent(str))).substr(0, 32);
    }
}

class Blockchain {
    constructor() {
        // Attempt to load from localStorage, otherwise create a new chain
        const savedData = localStorage.getItem('herbalChainData');
        if (savedData) {
            const parsedData = JSON.parse(savedData);
            this.chain = parsedData.chain;
            this.metadata = parsedData.metadata;
            this.inventories = parsedData.inventories;
            this.reputationScores = parsedData.reputationScores || this.getInitialReputation();
            this.qrScanLog = parsedData.qrScanLog || {}; // NEW: Load QR scan log
        } else {
            this.chain = [this.createGenesisBlock()];
            this.metadata = {}; 
            this.inventories = { 
                'SUPPLIER-001': {},
                'MANU-001': {},
                
            };
            this.reputationScores = this.getInitialReputation();
            this.qrScanLog = {}; // NEW: Initialize QR scan log
        }
    }

    getInitialReputation() {
        return {
            'COLLECTOR-001': 100,
            'SUPPLIER-001': 100,
            'MANU-001': 100,
            
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
        const data = { 
            type: 'registerHerb', 
            collectorID, 
            herbID, 
            name, 
            location, 
            quantity: parseFloat(quantity), 
            unitType, 
            quality, 
            timestamp: Date.now(),
            status: 'pending_verification'
        };
        this.addBlock(new Block(data.timestamp, data));
        
        this.metadata[herbID] = { name, location, quality, history: [data], status: 'pending_verification' };
        
        return { success: true, message: `Herb ID ${herbID} recorded and is pending verification by supplier.` };
    }

    verifyHerbReceipt(supplierID, herbID, measuredQuantity) {
        const masterHerb = this.metadata[herbID];
        if (!masterHerb || masterHerb.status !== 'pending_verification') {
            return { success: false, message: 'This herb batch is not awaiting verification.' };
        }

        const registrationBlockData = masterHerb.history[0];
        const claimedQuantity = registrationBlockData.quantity;
        const collectorID = registrationBlockData.collectorID;
        const tolerance = claimedQuantity * 0.02; // 2% tolerance for natural weight loss
        const difference = Math.abs(claimedQuantity - measuredQuantity);

        if (difference > tolerance) {
            // FRAUD ALERT
            masterHerb.status = 'disputed';
            registrationBlockData.status = 'disputed';
            this.reputationScores[collectorID] = (this.reputationScores[collectorID] || 100) - 10; // Penalize
            const data = {
                type: 'fraudAlert',
                herbID,
                claimedQuantity,
                measuredQuantity,
                timestamp: Date.now(),
                message: `Discrepancy found! Claimed: ${claimedQuantity}, Measured: ${measuredQuantity}.`
            };
            this.addBlock(new Block(data.timestamp, data));
            masterHerb.history.push(data);
            return { success: false, message: `FRAUD ALERT: Weight discrepancy is too high for Herb ID ${herbID}. Batch is now disputed.` };
        } else {
            // VERIFICATION SUCCESSFUL
            masterHerb.status = 'verified';
            registrationBlockData.status = 'verified';
            this.reputationScores[collectorID] = (this.reputationScores[collectorID] || 100) + 1; // Reward
            this.reputationScores[supplierID] = (this.reputationScores[supplierID] || 100) + 1; // Reward for verifying

            const data = {
                type: 'verifyReceipt',
                supplierID,
                herbID,
                verifiedQuantity: parseFloat(measuredQuantity),
                timestamp: Date.now()
            };
            this.addBlock(new Block(data.timestamp, data));
            masterHerb.history.push(data);
            
            this.inventories[supplierID][herbID] = {
                name: masterHerb.name,
                quantity: parseFloat(measuredQuantity),
                unitType: registrationBlockData.unitType
            };
            return { success: true, message: `Batch ${herbID} verified successfully with quantity ${measuredQuantity}.` };
        }
    }

    transferHerb(fromID, toID, herbID, weight, location, unitType, supplierQuality) {
        const supplierInventory = this.inventories[fromID];
        const supplierHerb = supplierInventory ? supplierInventory[herbID] : undefined;

        if (!supplierHerb) {
            return { success: false, message: `Herb ID ${herbID} not found in supplier's verified inventory.` };
        }
        
        const masterHerb = this.metadata[herbID];
        if (masterHerb.status !== 'verified') {
            return { success: false, message: `Cannot transfer a disputed or unverified batch.` };
        }

        if (supplierHerb.unitType !== unitType) {
            return { success: false, message: `Unit mismatch. Expected ${supplierHerb.unitType} but got ${unitType}.`};
        }

        const availableQuantity = supplierHerb.quantity;
        const transferWeight = parseFloat(weight);

        if (transferWeight > availableQuantity) {
            return { success: false, message: `Insufficient units. Available: ${availableQuantity.toFixed(2)} ${supplierHerb.unitType}, Requested: ${transferWeight.toFixed(2)} ${unitType}.` };
        }
        
        supplierHerb.quantity -= transferWeight;
        
        if (!this.inventories[toID]) this.inventories[toID] = {};
        if (!this.inventories[toID][herbID]) {
            this.inventories[toID][herbID] = { name: masterHerb.name, quantity: 0, unitType: supplierHerb.unitType };
        }
        this.inventories[toID][herbID].quantity += transferWeight;

        const data = { type: 'transferHerb', fromID, toID, herbID, weight: transferWeight, unitType, location, supplierQuality, timestamp: Date.now() };
        this.addBlock(new Block(data.timestamp, data));
        masterHerb.history.push(data);
        
        return { success: true, message: `${transferWeight.toFixed(2)} ${unitType} of ${masterHerb.name} successfully transferred.` };
    }
    
    useHerbInMedicine(batchID, manufacturerID, location, usedBatches, finalWeight, finalUnit, manufacturerQuality) {
        const invalidHerbs = [];
        
        if (manufacturerQuality.score < 60) {
            this.reputationScores[manufacturerID] = (this.reputationScores[manufacturerID] || 100) - 5;
            return { success: false, message: `QUALITY BLOCKED! Manufacturer's final product score is too low: ${manufacturerQuality.score}/100. Production denied.` };
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
        this.reputationScores[manufacturerID] = (this.reputationScores[manufacturerID] || 100) + 2;

        return { success: true, message: `Batch ${batchID} successfully recorded.` };
    }
}

//---------------------------------------------------------
// Data Persistence Functions
//---------------------------------------------------------
function saveData() {
    const dataToSave = {
        chain: herbChain.chain,
        metadata: herbChain.metadata,
        inventories: herbChain.inventories,
        reputationScores: herbChain.reputationScores,
        qrScanLog: herbChain.qrScanLog // Save the QR scan log
    };
    localStorage.setItem('herbalChainData', JSON.stringify(dataToSave));
}

function clearData() {
    if (confirm("Are you sure you want to clear all blockchain data? This action cannot be undone.")) {
        localStorage.removeItem('herbalChainData');
        location.reload();
    }
}

//---------------------------------------------------------
// DOM ELEMENTS AND EVENT LISTENERS
//---------------------------------------------------------
let herbChain = new Blockchain(); // Initialize blockchain (loads from storage if available)

// Global DOM Elements
const tabs = document.querySelectorAll('.tab-button');
const tabContents = document.querySelectorAll('.tab-content');
const ledgerBody = document.getElementById('ledger-body');
const downloadPdfBtn = document.getElementById('download-pdf-btn');
const clearDataBtn = document.getElementById('clear-data-btn');

// Collector elements
const addHerbBtn = document.getElementById('add-herb-btn');

// Supplier elements
const verifyHerbSelect = document.getElementById('verify-herb-id');
const measuredQuantityInput = document.getElementById('measured-quantity');
const measuredUnitSelect = document.getElementById('measured-unit-select');
const verifyReceiptBtn = document.getElementById('verify-receipt-btn');
const transferHerbSelect = document.getElementById('transfer-herb-id');
const availableUnitsSupplierSpan = document.getElementById('available-units-supplier');
const transferHerbBtn = document.getElementById('transfer-herb-btn');

// Manufacturer elements
const produceMedicineBtn = document.getElementById('produce-medicine-btn');
const multiBatchInputsContainer = document.getElementById('multi-batch-inputs');
const addBatchBtn = document.getElementById('add-batch-btn');
const qrcodeDiv = document.getElementById('qrcode');
const qrTitle = document.getElementById('qr-title');
const generatedQrCount = document.getElementById('generated-qr-count');
const MAX_BATCHES = 5;

// Consumer tab elements
const qrImageInput = document.getElementById('qr-image-input');
const traceResultDiv = document.getElementById('trace-result');
const traceContent = document.getElementById('trace-content');
let html5QrcodeScanner;
const startScanBtn = document.getElementById('start-scan-btn');
const stopScanBtn = document.getElementById('stop-scan-btn');

let collectorQualityData = null;
let supplierQualityData = null;
let manufacturerQualityData = null;
let collectorStream, supplierStream, manufacturerStream = null;

//---------------------------------------------------------
// UI Update Functions
//---------------------------------------------------------
function updateAllUI() {
    updateLedger();
    updateSupplierForm();
    updateManufacturerForm();
    updateReputationScores();
    saveData();
}

/**
 * Updates the reputation score display on the UI.
 */
function updateReputationScores() {
    const scoresContainer = document.getElementById('reputation-scores');
    scoresContainer.innerHTML = ''; // Clear existing scores

    if (!herbChain.reputationScores) return;

    // A mapping for better display names
    const manuOptions = document.getElementById('transfer-to').options;
    const participantNames = {
        'COLLECTOR-001': 'Collector',
        'SUPPLIER-001': 'Supplier',
    };
    for(let i=1; i<manuOptions.length; i++){
        participantNames[manuOptions[i].value] = manuOptions[i].textContent;
    }


    Object.entries(herbChain.reputationScores).forEach(([id, score]) => {
        const card = document.createElement('div');
        card.className = 'reputation-card';

        const displayName = participantNames[id] || id;

        let scoreClass = '';
        if (score < 90) scoreClass = 'low-score';

        card.innerHTML = `
            <span class="participant-name">${displayName}</span>
            <span class="participant-score ${scoreClass}">${score}</span>
        `;
        scoresContainer.appendChild(card);
    });
}


function updateSupplierForm() {
    // Populate the UNVERIFIED batches dropdown
    const unverifiedBatches = Object.entries(herbChain.metadata)
        .filter(([id, data]) => data.status === 'pending_verification');
    
    verifyHerbSelect.innerHTML = '<option value="">No unverified batches found...</option>';
    if (unverifiedBatches.length > 0) {
        verifyHerbSelect.innerHTML = '<option value="">Select an unverified batch...</option>';
        unverifiedBatches.forEach(([id, data]) => {
            const option = document.createElement('option');
            option.value = id;
            const regData = data.history[0];
            option.textContent = `${regData.name} (ID: ${id.substring(5,12)}... Claim: ${regData.quantity} ${regData.unitType})`;
            verifyHerbSelect.appendChild(option);
        });
    }

    // Populate the VERIFIED batches dropdown for transfer
    const supplierInventory = herbChain.inventories['SUPPLIER-001'];
    const availableHerbs = Object.entries(supplierInventory)
        .filter(([id, data]) => data.quantity > 0 && herbChain.metadata[id].status === 'verified');

    transferHerbSelect.innerHTML = '<option value="">Select a verified herb...</option>';
    if (availableHerbs.length > 0) {
        availableHerbs.forEach(([id, data]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = `${data.name} (ID: ${id.substring(5, 12)}... - ${data.quantity.toFixed(2)} ${data.unitType})`;
            transferHerbSelect.appendChild(option);
        });
    }
    
    availableUnitsSupplierSpan.textContent = '';
}

function updateManufacturerForm() {
    const manufacturerInventory = herbChain.inventories['MANU-001'] || {};
    const transferredHerbs = Object.entries(manufacturerInventory).filter(([id, data]) => data.quantity > 0);

    if (transferredHerbs.length === 0) {
        multiBatchInputsContainer.innerHTML = '<p>No transferred herbs in inventory to use.</p>';
    } else if (multiBatchInputsContainer.querySelectorAll('.batch-input-group').length === 0) {
         multiBatchInputsContainer.innerHTML = '';
    }

    const canAddMore = multiBatchInputsContainer.querySelectorAll('.batch-input-group').length < MAX_BATCHES;

    if (transferredHerbs.length > 0 && canAddMore) {
        addBatchBtn.style.display = 'block';
        addBatchBtn.textContent = 'Add Herb Batch';
        addBatchBtn.disabled = false;
        addBatchBtn.classList.remove('disabled');
    } else {
        addBatchBtn.style.display = 'block';
        addBatchBtn.textContent = canAddMore ? 'No Batches Available' : `Maximum ${MAX_BATCHES} Batches`;
        addBatchBtn.disabled = true;
        addBatchBtn.classList.add('disabled');
    }
}

function updateLedger() {
    if (herbChain.chain.length <= 1) {
        ledgerBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--accent-color);">No transactions yet.</td></tr>';
        return;
    }
    ledgerBody.innerHTML = '';
    herbChain.chain.slice(1).reverse().forEach((block, index) => {
        const data = block.data;
        let fraudAlertStatus = '✅ N/A';
        let qualityMatchStatus = 'N/A';
        
        if (data.type === 'fraudAlert') {
            fraudAlertStatus = `🚨 DISPUTED! Claim: ${data.claimedQuantity}, Measured: ${data.measuredQuantity}`;
        }
        
        if (data.type === 'transferHerb' && data.supplierQuality) {
            qualityMatchStatus = data.supplierQuality.score >= 70 ? '✅ Passed (>=70)' : `🚨 Failed (<70)`;
        } else if (data.type === 'useHerb' && data.manufacturerQuality) {
            qualityMatchStatus = data.manufacturerQuality.score >= 60 ? '✅ Passed (>=60)' : `🚨 Failed (<60)`;
        }

        let formattedData = '';
        Object.entries(data).forEach(([key, value]) => {
            let displayValue = '';
            if (typeof value === 'object' && value !== null) {
                if (key === 'usedBatches') {
                    displayValue = value.map(b => `  - ID: ${b.herbID.substring(0,15)}... (${b.unitsUsed} ${b.unitType})`).join('<br>');
                } else {
                    displayValue = JSON.stringify(value, null, 2);
                }
            } else {
                displayValue = value;
            }
             formattedData += `<strong>${key}:</strong><br>${displayValue}<br><br>`;
        });


        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${herbChain.chain.length - 1 - index}</td>
            <td>${block.previousHash.substring(0, 10)}...</td>
            <td>${block.hash.substring(0, 10)}...</td>
            <td>
                <details>
                    <summary class="data-summary">${data.type}</summary>
                    <pre style="white-space: pre-wrap; word-wrap: break-word;">${formattedData}</pre>
                </details>
            </td>
            <td>${fraudAlertStatus}</td>
            <td>${qualityMatchStatus}</td>
        `;
        if (data.type === 'fraudAlert') {
            row.style.backgroundColor = 'var(--error-light)';
            row.style.color = 'var(--error-dark)';
        }
        ledgerBody.appendChild(row);
    });
}

//---------------------------------------------------------
// Page Initialization
//---------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    // Set initial tab
    document.querySelector('.tab-button[data-tab="collector"]').click();

    // Set theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark-mode');
    }
    
    updateAllUI(); // Initial UI update from potentially loaded data
});

//---------------------------------------------------------
// Tab Switching
//---------------------------------------------------------
tabs.forEach(button => {
    button.addEventListener('click', () => {
        const tab = button.dataset.tab;
        tabs.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        tabContents.forEach(content => content.classList.remove('active'));
        document.getElementById(tab).classList.add('active');
        
        stopAllCameras();
        
        // Clear status messages when switching tabs
        document.querySelectorAll('.status-message').forEach(el => el.innerHTML = '');

        if(tab === 'supplier') updateSupplierForm();
        if(tab === 'manufacturer') updateManufacturerForm();
    });
});

//---------------------------------------------------------
// Event Listeners for Forms and Buttons
//---------------------------------------------------------

// Collector Form
addHerbBtn.addEventListener('click', () => {
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

    if (!collectorQualityData || collectorQualityData.score < 50) {
        statusDiv.textContent = 'AI Quality Check must be run and must pass (Score >= 50).';
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
        updateAllUI();
    } else {
        statusDiv.textContent = result.message;
        statusDiv.className = 'status-message error';
    }
});

// Supplier Verification Form
verifyReceiptBtn.addEventListener('click', () => {
    const herbID = verifyHerbSelect.value;
    const measuredQuantity = measuredQuantityInput.value;
    const statusDiv = document.getElementById('verify-status');

    if (!herbID || !measuredQuantity) {
        statusDiv.textContent = 'Please select a batch and enter the measured quantity.';
        statusDiv.className = 'status-message error';
        return;
    }
    
    const result = herbChain.verifyHerbReceipt('SUPPLIER-001', herbID, parseFloat(measuredQuantity));
    
    statusDiv.textContent = result.message;
    statusDiv.className = `status-message ${result.success ? 'success' : 'error'}`;
    
    updateAllUI();
});

// Supplier Transfer Form
transferHerbBtn.addEventListener('click', () => {
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

    if (!supplierQualityData || supplierQualityData.score < 70) {
        statusDiv.textContent = 'AI Quality Check must be run and must pass (Score >= 70).';
        statusDiv.className = 'status-message error';
        return;
    }

    const result = herbChain.transferHerb('SUPPLIER-001', toID, herbID, weight, location, unitType, supplierQualityData);
    
    statusDiv.textContent = result.message;
    statusDiv.className = `status-message ${result.success ? 'success' : 'error'}`;
    
    if (result.success) {
        document.getElementById('transfer-herb-id').value = '';
        document.getElementById('transfer-to').value = '';
        document.getElementById('supplier-weight').value = '';
        document.getElementById('supplier-location').value = '';
        document.getElementById('supplier-quality-result').textContent = '';
        availableUnitsSupplierSpan.textContent = '';
        supplierQualityData = null;
    }
    updateAllUI();
});

// Manufacturer Form: Add Batch Button
addBatchBtn.addEventListener('click', () => {
    const currentBatches = multiBatchInputsContainer.querySelectorAll('.batch-input-group').length;
    if (currentBatches >= MAX_BATCHES) return;

    const availableHerbs = Object.entries(herbChain.inventories['MANU-001'])
        .filter(([id, data]) => data.quantity > 0);

    if (availableHerbs.length === 0) {
        alert('No transferred herbs with available quantity to add.');
        return;
    }
    
    if (multiBatchInputsContainer.querySelector('p')) {
        multiBatchInputsContainer.innerHTML = '';
    }

    const newBatchInputGroup = document.createElement('div');
    newBatchInputGroup.className = 'batch-input-group';

    newBatchInputGroup.innerHTML = `
        <div>
            <label>Herb Batch:</label>
            <select class="used-herb-ids-select" required></select>
            <span class="available-units-label"></span>
            <button type="button" class="remove-batch-btn">&times;</button>
        </div>
        <div>
            <label>Units Used:</label>
            <div class="unit-input-group">
                <input type="number" class="units-used-input" placeholder="0" required>
                <select class="units-used-select" disabled>
                    <option value="Kg">Kg</option><option value="Gram">Gram</option><option value="Pieces">Pieces</option><option value="Bundles">Bundles</option>
                </select>
            </div>
        </div>
    `;

    const selectElement = newBatchInputGroup.querySelector('.used-herb-ids-select');
    selectElement.innerHTML = '<option value="">Select a batch...</option>';
    availableHerbs.forEach(([id, data]) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = `${data.name} (ID: ${id.substring(5, 12)}... - ${data.quantity.toFixed(2)} ${data.unitType})`;
        selectElement.appendChild(option);
    });

    selectElement.addEventListener('change', (e) => {
        const selectedHerbId = e.target.value;
        const availableUnitsLabel = newBatchInputGroup.querySelector('.available-units-label');
        const unitSelect = newBatchInputGroup.querySelector('.units-used-select');
        if (selectedHerbId) {
            const herbData = herbChain.inventories['MANU-001'][selectedHerbId];
            availableUnitsLabel.textContent = `(Max: ${herbData.quantity.toFixed(2)})`;
            unitSelect.value = herbData.unitType;
        } else {
            availableUnitsLabel.textContent = '';
        }
    });

    newBatchInputGroup.querySelector('.remove-batch-btn').addEventListener('click', () => {
        newBatchInputGroup.remove();
        updateManufacturerForm();
    });

    multiBatchInputsContainer.appendChild(newBatchInputGroup);
    updateManufacturerForm();
});

// Manufacturer Form: Produce Medicine Button
produceMedicineBtn.addEventListener('click', () => {
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
        if (!select.value || !input.value || parseFloat(input.value) <= 0) isValid = false;
        usedBatches.push({ herbID: select.value, unitsUsed: parseFloat(input.value), unitType: unitSelect.value });
    });

    if (!batchID || !location || isNaN(finalWeight) || finalWeight <= 0 || !isValid || usedBatches.length === 0) {
        statusDiv.textContent = 'Please fill all fields, add at least one valid herb batch, and ensure all values are positive.';
        statusDiv.className = 'status-message error';
        return;
    }

    if (!manufacturerQualityData || manufacturerQualityData.score < 60) {
        statusDiv.textContent = 'Final Product AI Quality Check must be run and must pass (Score >= 60).';
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
                unitID: `${batchID}-${String(i).padStart(4, '0')}`,
                type: 'medicine',
                sourceHerbs: usedBatches.map(b => b.herbID),
                producedOn: new Date().toISOString().split('T')[0]
            });
            
            const qrContainer = document.createElement('div');
            qrContainer.className = 'qr-code-item';

            const qrElement = document.createElement('div');
            new QRCode(qrElement, { text: qrData, width: 128, height: 128 });
            qrContainer.appendChild(qrElement);

            const qrLabel = document.createElement('p');
            qrLabel.textContent = `Unit ${i}`;
            qrContainer.appendChild(qrLabel);
            
            const downloadBtn = document.createElement('button');
            downloadBtn.textContent = 'Download';
            downloadBtn.className = 'btn download-qr-btn';
            downloadBtn.onclick = function() {
                const a = document.createElement('a');
                a.href = qrElement.querySelector('img').src;
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
        updateAllUI();
    } else {
        statusDiv.textContent = result.message;
        statusDiv.className = 'status-message error';
        generatedQrCount.textContent = '';
    }
});


// Supplier Form Dropdown Listeners
verifyHerbSelect.addEventListener('change', (e) => {
    const selectedHerbId = e.target.value;
    if (selectedHerbId && herbChain.metadata[selectedHerbId]) {
        const herbData = herbChain.metadata[selectedHerbId].history[0];
        measuredUnitSelect.value = herbData.unitType;
    }
});

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


//---------------------------------------------------------
// Helper/Utility Functions (Camera, Geolocation, etc.)
//---------------------------------------------------------
function stopAllCameras() {
    stopCamera('collector');
    stopCamera('supplier');
    stopCamera('manufacturer');
    if (html5QrcodeScanner && html5QrcodeScanner.getState() === 2) { // 2 is SCANNING state
        stopScanner();
    }
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
    
    statusDiv.textContent = 'Analyzing snapshot...';
    statusDiv.className = 'status-message warning';

    setTimeout(() => { // Simulate AI processing
        const qualityScore = Array.from(imageData).reduce((acc, val) => acc + val, 0) % 51 + 50;
        let qualityStatus, statusClass;
        let qualityData = { score: qualityScore };

        let thresholds = { collector: 50, supplier: 70, manufacturer: 60 };
        let threshold = thresholds[role];

        if (qualityScore < threshold) {
            qualityStatus = `Check Failed! Score is below the required ${threshold}.`;
            statusClass = "error";
        } else {
            qualityStatus = "Passed";
            statusClass = "success";
        }

        qualityData.status = qualityStatus;
        if(role === 'collector') collectorQualityData = qualityData;
        if(role === 'supplier') supplierQualityData = qualityData;
        if(role === 'manufacturer') manufacturerQualityData = qualityData;

        statusDiv.textContent = `AI analysis complete! Quality Score: ${qualityScore}/100. Status: ${qualityStatus}`;
        statusDiv.className = `status-message ${statusClass}`;
    }, 1000);
}

function getGeoLocation(role) {
    const locationInput = document.getElementById(`${role}-location`);
    const statusDiv = document.getElementById(`${role}-status`);
    if (navigator.geolocation) {
        statusDiv.textContent = 'Requesting location...';
        statusDiv.className = 'status-message warning';
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                locationInput.value = `Lat: ${latitude.toFixed(4)}, Lon: ${longitude.toFixed(4)}`;
                statusDiv.textContent = 'Location captured successfully.';
                statusDiv.className = 'status-message success';
            },
            (error) => {
                statusDiv.textContent = `Error: ${error.message}`;
                statusDiv.className = 'status-message error';
            }
        );
    } else {
        statusDiv.textContent = 'Geolocation is not supported by your browser.';
        statusDiv.className = 'status-message error';
    }
}

// All location capture button listeners
['collector', 'supplier', 'manufacturer'].forEach(role => {
    document.getElementById(`capture-${role}-location-btn`).addEventListener('click', () => getGeoLocation(role));
    document.getElementById(`start-${role}-camera-btn`).addEventListener('click', () => startCamera(role));
    document.getElementById(`check-${role}-quality-btn`).addEventListener('click', () => takeSnapshotAndCheck(role));
    document.getElementById(`stop-${role}-camera-btn`).addEventListener('click', () => stopCamera(role));
});

// --- Consumer Tab Logic ---
function onScanSuccess(decodedText) {
    stopScanner();
    processQrData(decodedText);
}
function onScanError(errorMessage) { /* Quietly handle errors */ }

function startScanner() {
    if (!html5QrcodeScanner || html5QrcodeScanner.getState() !== 2) {
        html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
        html5QrcodeScanner.render(onScanSuccess, onScanError);
        startScanBtn.style.display = 'none';
        stopScanBtn.style.display = 'inline-block';
    }
}
function stopScanner() {
    if (html5QrcodeScanner && html5QrcodeScanner.getState() === 2) {
        html5QrcodeScanner.clear().catch(error => console.error("Failed to stop scanner:", error));
    }
    html5QrcodeScanner = null;
    startScanBtn.style.display = 'inline-block';
    stopScanBtn.style.display = 'none';
}

function handleQrImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const html5QrCode = new Html5Qrcode("file-scanner-container", { verbose: false });
    traceResultDiv.classList.remove('hidden');
    traceContent.innerHTML = '<p class="status-message warning">Scanning image...</p>';

    html5QrCode.scanFile(file, true)
        .then(decodedText => processQrData(decodedText))
        .catch(err => traceContent.innerHTML = `<p class="status-message error">Error scanning image: ${err}. Please try a clearer QR code image.</p>`)
        .finally(() => { qrImageInput.value = ''; });
}

function processQrData(qrDataString) {
    let qrData;
    traceResultDiv.classList.remove('hidden');
    try {
        qrData = JSON.parse(qrDataString);
    } catch (e) {
        traceContent.innerHTML = `<p class="status-message error">Invalid QR Code Data. Not in the correct JSON format.</p>`;
        return;
    }

    // NEW: One-Time Scan Logic
    if (qrData.unitID) {
        if (herbChain.qrScanLog[qrData.unitID]) {
            const firstScanTime = new Date(herbChain.qrScanLog[qrData.unitID].firstScanTimestamp).toLocaleString();
            traceContent.innerHTML = `
                <div class="qr-scan-warning">
                    <strong>⚠️ Warning: QR Code Already Scanned!</strong>
                    <p>This product's unique QR code was first scanned on:</p>
                    <p><strong>${firstScanTime}</strong></p>
                    <p>If you are not the first person to scan this, the product may be counterfeit. Please contact the manufacturer.</p>
                </div>`;
            return;
        } else {
            herbChain.qrScanLog[qrData.unitID] = { firstScanTimestamp: Date.now() };
            saveData();
        }
    }

    if (qrData.type === 'medicine' && qrData.batchID && qrData.sourceHerbs) {
        let html = `<h4>Medicine Batch Details</h4>
                    <p><strong>Batch ID:</strong> ${qrData.batchID}</p>
                    <p><strong>Unit ID:</strong> ${qrData.unitID}</p>
                    <p><strong>Produced On:</strong> ${qrData.producedOn}</p>`;

        const useBlock = herbChain.chain.find(block => block.data.batchID === qrData.batchID && block.data.type === 'useHerb');
        if(useBlock) html += `<p><strong>Production Location:</strong> ${useBlock.data.location || 'N/A'}</p>`;
        
        html += '<h4>Source Herb Batches:</h4>';
        qrData.sourceHerbs.forEach(herbId => {
            const herbMaster = herbChain.metadata[herbId];
            if (herbMaster) {
                html += `<div class="history-item">
                            <p><strong>Herb Name:</strong> ${herbMaster.name}</p>
                            <p><strong>Herb ID:</strong> ${herbId}</p><hr>`;
                herbMaster.history.forEach(rec => {
                    html += `<p><strong>Action:</strong> ${rec.type}<br>
                                 <strong>Timestamp:</strong> ${new Date(rec.timestamp).toLocaleString()}<br>
                                 <strong>Location:</strong> ${rec.location || 'N/A'}</p>`;
                });
                html += `</div>`;
            }
        });
        traceContent.innerHTML = html;
    } else {
        traceContent.innerHTML = '<p class="status-message error">Invalid QR Code. Not a valid medicine QR code.</p>';
    }
}

// --- Final Event Listeners for miscellaneous buttons ---
downloadPdfBtn.addEventListener('click', () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("HerbalChain Blockchain Ledger", 10, 15);
    doc.setFontSize(10);
    doc.text(`Report Generated: ${new Date().toLocaleString()}`, 10, 22);

    const tableData = herbChain.chain.slice(1).map((block, index) => {
        const data = block.data;
        const formattedData = Object.entries(data).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');
        let fraudAlertStatus = data.type === 'fraudAlert' ? `DISPUTED` : 'N/A';
        return [
            herbChain.chain.length - 1 - index,
            block.previousHash.substring(0, 10) + '...',
            block.hash.substring(0, 10) + '...',
            formattedData,
            fraudAlertStatus,
            'N/A' // Quality match placeholder for PDF
        ];
    });

    doc.autoTable({
        startY: 30,
        head: [['Block ID', 'Previous Hash', 'Current Hash', 'Data', 'Fraud Alert', 'Quality Match']],
        body: tableData,
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
        columnStyles: { 3: { cellWidth: 85 } },
    });
    doc.save('HerbalChain_Ledger.pdf');
});

document.getElementById('theme-toggle').addEventListener('click', () => {
    document.documentElement.classList.toggle('dark-mode');
    localStorage.setItem('theme', document.documentElement.classList.contains('dark-mode') ? 'dark' : 'light');
});

document.getElementById('language-toggle').addEventListener('click', () => {
    alert('Language selection feature coming soon!');
});

qrImageInput.addEventListener('change', handleQrImageUpload);
startScanBtn.addEventListener('click', startScanner);
stopScanBtn.addEventListener('click', stopScanner);
clearDataBtn.addEventListener('click', clearData);