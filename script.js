// XML escaping function
function escapeXML(text) {
    if (!text) return text;
    return text.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Verifica che JSZip sia caricato
function checkJSZip() {
    if (typeof JSZip === 'undefined') {
        console.error('JSZip not loaded');
        return false;
    }
    return true;
}

// Mode switching
document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener('change', function() {
        const fieldInputs = document.getElementById('fieldInputs');
        const globalInputs = document.getElementById('globalInputs');
        
        if (this.value === 'field') {
            fieldInputs.classList.remove('hidden');
            globalInputs.classList.add('hidden');
        } else {
            fieldInputs.classList.add('hidden');
            globalInputs.classList.remove('hidden');
        }
        
        // Clear outputs when switching modes
        clearOutputs();
    });
});

function generateXML() {
    const data = document.getElementById('excelData').value.trim();
    const separator = document.querySelector('input[name="separator"]:checked').value;
    const mode = document.querySelector('input[name="mode"]:checked').value;
    
    if (!data) {
        alert('Please paste your Excel data first!');
        return;
    }

    const lines = data.split('\n').filter(line => line.trim());
    const sep = separator === 'tab' ? '\t' : ',';
    
    if (mode === 'field') {
        generateFieldXML(lines, sep);
    } else {
        generateGlobalValueSetXML(lines, sep);
    }
}

function generateFieldXML(lines, sep) {
    const objectName = document.getElementById('objectName').value.trim();
    const fieldName = document.getElementById('fieldName').value.trim();
    
    if (!objectName || !fieldName) {
        alert('Please enter both Object and Field API names!');
        return;
    }

    let xmlValues = '';

    lines.forEach(line => {
        const parts = line.split(sep);
        if (parts.length >= 2) {
            const apiName = escapeXML(parts[0].trim());
            const label = escapeXML(parts[1].trim());
            
            xmlValues += `                <value>
                    <fullName>${apiName}</fullName>
                    <default>false</default>
                    <label>${label}</label>
                </value>\n`;
        }
    });

    // Generate complete XML structure
    const fieldLabel = escapeXML(fieldName.replace(/__c$/, '').replace(/_/g, ' '));
    const completeXML = `<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">
    <fields>
        <fullName>${escapeXML(fieldName)}</fullName>
        <externalId>false</externalId>
        <label>${fieldLabel}</label>
        <required>false</required>
        <trackTrending>false</trackTrending>
        <type>Picklist</type>
        <valueSet>
            <valueSetDefinition>
                <sorted>false</sorted>
${xmlValues}            </valueSetDefinition>
        </valueSet>
    </fields>
</CustomObject>`;

    // Generate package.xml
    const packageXML = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>${escapeXML(objectName)}</members>
        <name>${fieldName}</name>
    </types>
    <version>58.0</version>
</Package>`;

    document.getElementById('output').value = xmlValues;
    document.getElementById('completeXML').value = completeXML;
    document.getElementById('packageXML').value = packageXML;
    
    document.getElementById('deploymentInstructions').innerHTML = `
        <strong>Custom Field Deployment Steps:</strong><br><br>
        1. Save the Complete XML as <code>objects/${escapeXML(objectName)}.object</code><br>
        2. Save the Package.xml as <code>package.xml</code><br>
        3. Create a ZIP file with the proper folder structure<br>
        4. Use Salesforce Workbench to deploy the ZIP file<br><br>
        <strong>🎯 Quick Actions:</strong> Use the buttons below to download the ZIP and open Workbench directly!
    `;
    
    // Show action buttons
    document.getElementById('downloadBtn').style.display = 'inline-flex';
    document.getElementById('workbenchBtn').style.display = 'inline-flex';
}

function generateGlobalValueSetXML(lines, sep) {
    const globalValueSetName = document.getElementById('globalValueSetName').value.trim();
    const masterLabel = document.getElementById('masterLabel').value.trim();
    
    if (!globalValueSetName || !masterLabel) {
        alert('Please enter both Global Value Set API Name and Master Label!');
        return;
    }

    let xmlValues = '';

    lines.forEach(line => {
        const parts = line.split(sep);
        if (parts.length >= 2) {
            const apiName = escapeXML(parts[0].trim());
            const label = escapeXML(parts[1].trim());
            
            xmlValues += `    <customValue>
        <fullName>${apiName}</fullName>
        <default>false</default>
        <label>${label}</label>
    </customValue>\n`;
        }
    });

    // Generate complete XML structure
    const completeXML = `<?xml version="1.0" encoding="UTF-8"?>
<GlobalValueSet xmlns="http://soap.sforce.com/2006/04/metadata">
${xmlValues}    <masterLabel>${escapeXML(masterLabel)}</masterLabel>
    <sorted>false</sorted>
</GlobalValueSet>`;

    // Generate package.xml
    const packageXML = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>${escapeXML(globalValueSetName)}</members>
        <name>GlobalValueSet</name>
    </types>
    <version>58.0</version>
</Package>`;

    document.getElementById('output').value = xmlValues;
    document.getElementById('completeXML').value = completeXML;
    document.getElementById('packageXML').value = packageXML;
    
    document.getElementById('deploymentInstructions').innerHTML = `
        <strong>Global Value Set Deployment Steps:</strong><br><br>
        1. Save the Complete XML as <code>globalValueSets/${escapeXML(globalValueSetName)}.globalValueSet</code><br>
        2. Save the Package.xml as <code>package.xml</code><br>
        3. Create a ZIP file with the proper folder structure<br>
        4. Use Salesforce Workbench to deploy the ZIP file<br><br>
        <strong>🎯 Quick Actions:</strong> Use the buttons below to download the ZIP and open Workbench directly!
    `;
    
    // Show action buttons
    document.getElementById('downloadBtn').style.display = 'inline-flex';
    document.getElementById('workbenchBtn').style.display = 'inline-flex';
}

function clearData() {
    document.getElementById('excelData').value = '';
    clearOutputs();
}

function clearOutputs() {
    document.getElementById('output').value = '';
    document.getElementById('completeXML').value = '';
    document.getElementById('packageXML').value = '';
    document.getElementById('deploymentInstructions').innerHTML = 'Choose a mode and generate XML to see deployment instructions.';
    document.getElementById('downloadBtn').style.display = 'none';
    document.getElementById('workbenchBtn').style.display = 'none';
}

function copyToClipboard() {
    const output = document.getElementById('output');
    output.select();
    document.execCommand('copy');
    alert('XML values copied to clipboard!');
}

function copyCompleteXML() {
    const completeXML = document.getElementById('completeXML');
    completeXML.select();
    document.execCommand('copy');
    alert('Complete XML copied to clipboard!');
}

function copyPackageXML() {
    const packageXML = document.getElementById('packageXML');
    packageXML.select();
    document.execCommand('copy');
    alert('Package.xml copied to clipboard!');
}

function openWorkbench() {
    window.open('https://workbench.developerforce.com/', '_blank');
}

function downloadDeploymentZip() {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const completeXML = document.getElementById('completeXML').value;
    const packageXML = document.getElementById('packageXML').value;
    
    if (!completeXML || !packageXML) {
        alert('Please generate XML first!');
        return;
    }

    // Verifica che JSZip sia disponibile
    if (!checkJSZip()) {
        alert('ZIP library not loaded. Please copy the files manually.');
        return;
    }

    try {
        // Create JSZip instance
        const zip = new JSZip();
        
        // Add package.xml to root
        zip.file('package.xml', packageXML);
        
        let zipFileName = '';
        
        if (mode === 'field') {
            const objectName = document.getElementById('objectName').value.trim();
            const fieldName = document.getElementById('fieldName').value.trim();
            
            // Create objects folder and add the object file
            zip.folder('objects');
            zip.file(`objects/${objectName}.object`, completeXML);
            
            zipFileName = `${objectName}_${fieldName}_deployment.zip`;
        } else {
            const globalValueSetName = document.getElementById('globalValueSetName').value.trim();
            
            // Create globalValueSets folder and add the file
            zip.folder('globalValueSets');
            zip.file(`globalValueSets/${globalValueSetName}.globalValueSet`, completeXML);
            
            zipFileName = `${globalValueSetName}_deployment.zip`;
        }
        
        // Generate and download the ZIP file
        zip.generateAsync({type: 'blob'})
            .then(function(content) {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(content);
                link.download = zipFileName;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Cleanup
                setTimeout(() => {
                    URL.revokeObjectURL(link.href);
                }, 100);
            })
            .catch(function(error) {
                console.error('Error generating ZIP:', error);
                alert('Error creating ZIP file. Please copy the XML files manually.');
            });
    } catch (error) {
        console.error('Error in downloadDeploymentZip:', error);
        alert('Error creating ZIP file. Please copy the XML files manually.');
    }
}

// Auto-detect separator based on input
document.getElementById('excelData').addEventListener('paste', function(e) {
    setTimeout(() => {
        const data = this.value;
        const tabCount = (data.match(/\t/g) || []).length;
        const commaCount = (data.match(/,/g) || []).length;
        
        if (tabCount > commaCount) {
            document.getElementById('tab').checked = true;
        } else if (commaCount > tabCount) {
            document.getElementById('comma').checked = true;
        }
    }, 100);
});

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('Salesforce Picklist XML Generator initialized');
    
    // Set default focus
    const excelDataTextarea = document.getElementById('excelData');
    if (excelDataTextarea) {
        excelDataTextarea.focus();
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + Enter to generate XML
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        generateXML();
    }
    
    // Ctrl/Cmd + Shift + C to copy complete XML
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        copyCompleteXML();
    }
    
    // Ctrl/Cmd + Shift + D to download ZIP
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'D') {
        e.preventDefault();
        const downloadBtn = document.getElementById('downloadBtn');
        if (downloadBtn.style.display !== 'none') {
            downloadDeploymentZip();
        }
    }
});

// Validation helpers
function validateFieldInputs() {
    const objectName = document.getElementById('objectName').value.trim();
    const fieldName = document.getElementById('fieldName').value.trim();
    
    const errors = [];
    
    if (!objectName) {
        errors.push('Object API Name is required');
    }
    
    if (!fieldName) {
        errors.push('Field API Name is required');
    }
    
    // Basic validation for API names
    const apiNamePattern = /^[a-zA-Z][a-zA-Z0-9_]*(__c)?$/;
    
    if (objectName && !apiNamePattern.test(objectName)) {
        errors.push('Object API Name should follow Salesforce naming conventions');
    }
    
    if (fieldName && !apiNamePattern.test(fieldName)) {
        errors.push('Field API Name should follow Salesforce naming conventions');
    }
    
    return errors;
}

function validateGlobalValueSetInputs() {
    const globalValueSetName = document.getElementById('globalValueSetName').value.trim();
    const masterLabel = document.getElementById('masterLabel').value.trim();
    
    const errors = [];
    
    if (!globalValueSetName) {
        errors.push('Global Value Set API Name is required');
    }
    
    if (!masterLabel) {
        errors.push('Master Label is required');
    }
    
    // Basic validation for API names
    const apiNamePattern = /^[a-zA-Z][a-zA-Z0-9_]*$/;
    
    if (globalValueSetName && !apiNamePattern.test(globalValueSetName)) {
        errors.push('Global Value Set API Name should follow Salesforce naming conventions');
    }
    
    return errors;
}

// Enhanced error handling
function showValidationErrors(errors) {
    if (errors.length > 0) {
        const errorMessage = 'Please fix the following errors:\n\n' + errors.map(error => '• ' + error).join('\n');
        alert(errorMessage);
        return false;
    }
    return true;
}

// Update generateXML function to include validation
const originalGenerateXML = generateXML;
generateXML = function() {
    const mode = document.querySelector('input[name="mode"]:checked').value;
    
    let errors = [];
    if (mode === 'field') {
        errors = validateFieldInputs();
    } else {
        errors = validateGlobalValueSetInputs();
    }
    
    if (!showValidationErrors(errors)) {
        return;
    }
    
    originalGenerateXML();
};