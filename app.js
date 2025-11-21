// Initialize Firebase Services
const db = firebase.firestore();
const auth = firebase.auth();
const googleProvider = new firebase.auth.GoogleAuthProvider();

// --- All functions are defined globally so they can be called from anywhere ---

function debugLink(event) {
    event.preventDefault();
    const link = event.currentTarget.href;
    alert("Navigating to: " + link);
    window.location.href = link;
}

const handleDoseCheck = (e) => {
    const checkbox = e.target;
    const prescriptionId = checkbox.dataset.prescriptionId;
    const time = checkbox.value;
    const isChecked = checkbox.checked;
    const today = new Date().toISOString().split('T')[0];

    const user = auth.currentUser;
    if (!user) return;

    const prescriptionRef = db.collection('users').doc(user.uid).collection('prescriptions').doc(prescriptionId);
    
    const doseUpdate = {};
    const fieldPath = `dosesTaken.${today}`;

    if (isChecked) {
        // Add the time to today's array of taken doses
        doseUpdate[fieldPath] = firebase.firestore.FieldValue.arrayUnion(time);
    } else {
        // Remove the time from today's array
        doseUpdate[fieldPath] = firebase.firestore.FieldValue.arrayRemove(time);
    }

    prescriptionRef.update(doseUpdate).catch(error => {
        console.error("Error updating dose status:", error);
        alert("Failed to update dose status.");
        checkbox.checked = !isChecked; // Revert checkbox on error
    });
};

// --- Helper Functions (for main.html - Patient Dashboard) ---
const displayUserData = (user) => {
    if (!user) return;

    const userDocRef = db.collection('users').doc(user.uid);
    const profileUsername = document.getElementById('profile-username');
    const userDisplayName = document.getElementById('user-display-name');
    const prescriptionsList = document.getElementById('prescriptions-list');
    const bloodPressureHistory = document.getElementById('blood-pressure-history');

    // Display user's name
    userDocRef.onSnapshot(doc => {
        if (doc.exists) {
            const username = doc.data().username || user.displayName;
            if (profileUsername) profileUsername.textContent = username;
            if (userDisplayName) userDisplayName.textContent = username;
        }
    });

    // Display Prescriptions
    if (prescriptionsList) {
        userDocRef.collection('prescriptions').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
            let html = '<ul class="list-group">';
            if (snapshot.empty) {
                html = '<p>No prescriptions found.</p>';
            } else {
                snapshot.forEach(doc => {
                    const prescriptionId = doc.id;
                    const data = doc.data();
                    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
                    const dosesTakenToday = (data.dosesTaken && data.dosesTaken[today]) ? data.dosesTaken[today] : [];

                    let timesHtml = '<ul class="list-inline mt-2">';
                    if (data.times && data.times.length > 0) {
                        data.times.forEach(time => {
                            const isChecked = dosesTakenToday.includes(time);
                            timesHtml += `
                                <li class="list-inline-item">
                                    <div class="form-check">
                                        <input class="form-check-input dose-checkbox" type="checkbox" value="${time}" id="dose-${prescriptionId}-${time.replace(':','')}" data-prescription-id="${prescriptionId}" ${isChecked ? 'checked' : ''}>
                                        <label class="form-check-label" for="dose-${prescriptionId}-${time.replace(':','')}">
                                            ${time}
                                        </label>
                                    </div>
                                </li>
                            `;
                        });
                    } else {
                        timesHtml += '<li class="list-inline-item"><small>No specific times scheduled.</small></li>';
                    }
                    timesHtml += '</ul>';

                    html += `
                        <li class="list-group-item">
                            <div class="d-flex w-100 justify-content-between">
                                <h5 class="mb-1">${data.name}</h5>
                                <small>${data.timestamp ? data.timestamp.toDate().toLocaleDateString() : ''}</small>
                            </div>
                            <p class="mb-1">${data.dosage}. ${data.notes || ''}</p>
                            <div>${timesHtml}</div>
                        </li>
                    `;
                });
                html += '</ul>';
            }
            prescriptionsList.innerHTML = html;
            
            // Add event listeners after the HTML is rendered
            document.querySelectorAll('.dose-checkbox').forEach(checkbox => {
                checkbox.addEventListener('change', handleDoseCheck);
            });

        }, error => {
            console.error("Error fetching prescriptions:", error);
            prescriptionsList.innerHTML = '<p class="text-danger">Could not load prescriptions.</p>';
        });
    }

    // Display Blood Pressure History
    if (bloodPressureHistory) {
        let bpChartInstance; // To hold the chart object

        userDocRef.collection('blood_pressure').orderBy('timestamp', 'desc').limit(7).onSnapshot(snapshot => {
            let html = '<ul class="list-group">';
            if (snapshot.empty) {
                html = '<p>No blood pressure readings found.</p>';
                if (bpChartInstance) {
                    bpChartInstance.destroy(); // Clear chart if no data
                }
            } else {
                 snapshot.forEach(doc => {
                    const data = doc.data();
                    html += `
                        <li class="list-group-item d-flex justify-content-between align-items-center">
                            <strong>${data.systolic}/${data.diastolic}</strong> mmHg
                            <small>${data.timestamp ? data.timestamp.toDate().toLocaleString() : ''}</small>
                        </li>
                    `;
                });
                html += '</ul>';

                // --- Chart.js Logic ---
                // Filter to get only the latest reading for each day
                const latestReadingsMap = new Map();
                snapshot.docs.forEach(doc => {
                    const dateStr = doc.data().timestamp.toDate().toISOString().split('T')[0];
                    if (!latestReadingsMap.has(dateStr)) {
                        latestReadingsMap.set(dateStr, doc);
                    }
                });

                const chartDocs = Array.from(latestReadingsMap.values()).reverse(); // oldest to newest
                
                const labels = chartDocs.map(doc => doc.data().timestamp ? doc.data().timestamp.toDate().toLocaleDateString('id-ID', { weekday: 'long' }) : '');
                const systolicData = chartDocs.map(doc => doc.data().systolic);
                const diastolicData = chartDocs.map(doc => doc.data().diastolic);

                const ctx = document.getElementById('bpChart').getContext('2d');

                if (bpChartInstance) {
                    bpChartInstance.destroy(); // Destroy old chart before drawing new one
                }

                bpChartInstance = new Chart(ctx, {
                    type: 'bar', // Changed to 'bar'
                    data: {
                        labels: labels,
                        datasets: [
                            {
                                label: 'Systolic (mmHg)',
                                data: systolicData,
                                borderColor: 'rgba(255, 99, 132, 1)',
                                backgroundColor: 'rgba(255, 99, 132, 0.5)', // Adjusted for bar chart
                                borderWidth: 1
                            },
                            {
                                label: 'Diastolic (mmHg)',
                                data: diastolicData,
                                borderColor: 'rgba(54, 162, 235, 1)',
                                backgroundColor: 'rgba(54, 162, 235, 0.5)', // Adjusted for bar chart
                                borderWidth: 1
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        plugins: {
                            title: {
                                display: true,
                                text: 'Blood Pressure by Day of Week' // Updated title
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: false,
                                title: {
                                    display: true,
                                    text: 'mmHg'
                                }
                            }
                        }
                    }
                });
            }
            bloodPressureHistory.innerHTML = html;
        }, error => {
            console.error("Error fetching blood pressure:", error);
            bloodPressureHistory.innerHTML = '<p class="text-danger">Could not load blood pressure history.</p>';
        });
    }
};

// --- Helper Functions (for dashboard.html) ---
const displayAdminDashboard = () => {
    const usersTableBody = document.getElementById('users-table-body');
    if (!usersTableBody) return;
    db.collection('users').onSnapshot(querySnapshot => {
        let usersHtml = '';
        querySnapshot.forEach(doc => {
            const user = doc.data();
            const uid = doc.id;
            const currentRole = user.role || 'user';
            
            usersHtml += `
                <tr>
                    <td>${user.username || '-'}</td>
                    <td>${user.email || '-'}</td>
                    <td>${currentRole}</td>
                    <td>
                        <select class="role-select" data-uid="${uid}" ${auth.currentUser.uid === uid ? 'disabled' : ''}>
                            <option value="patient" ${currentRole === 'patient' ? 'selected' : ''}>patient</option>
                            <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>admin</option>
                            <option value="doctor" ${currentRole === 'doctor' ? 'selected' : ''}>doctor</option>
                        </select>
                    </td>
                </tr>
            `;
        });
        usersTableBody.innerHTML = usersHtml;
        
        document.querySelectorAll('.role-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const newRole = e.target.value;
                const targetUid = e.target.dataset.uid;
                if (confirm(`Are you sure you want to change this user's role to ${newRole}?`)) {
                    updateUserRole(targetUid, newRole);
                } else {
                    e.target.value = currentRole;
                }
            });
        });
    }, error => console.error("Error fetching all users for admin:", error));
};

const updateUserRole = (uid, newRole) => {
    db.collection('users').doc(uid).update({ role: newRole })
        .then(() => alert("User role updated successfully."))
        .catch(error => {
            console.error("Error updating user role:", error);
            alert("Error: " + error.message);
        });
};

// --- Sign-in/Registration Functions ---
const signInWithGoogle = () => {
    auth.signInWithPopup(googleProvider)
        .then(result => {
            const user = result.user;
            const userDocRef = db.collection('users').doc(user.uid);

            return userDocRef.get().then(doc => {
                if (doc.exists) {
                    return;
                }
                
                return db.collection('users').where('email', '==', user.email).get().then(querySnapshot => {
                    let role = 'patient'; // Default role for brand new users
                    if (!querySnapshot.empty) {
                        const existingUserDoc = querySnapshot.docs[0];
                        role = existingUserDoc.data().role || 'patient'; // Use 'patient' as default if existing role is null
                    }

                    return userDocRef.set({
                        username: user.displayName,
                        email: user.email,
                        phoneNumber: user.phoneNumber || '',
                        role: role 
                    });
                });
            });
        })
        .catch(error => {
            console.error("Error during Google sign-in:", error);
            alert(`Google Sign-In Failed: ${error.message}`);
        });
};

// --- Patient List Functions (for patient_list.html) ---
const displayPatientList = () => {
    const patientsTableBody = document.getElementById('patients-table-body');
    if (!patientsTableBody) return;

    db.collection('users').where('role', '==', 'patient').onSnapshot(querySnapshot => {
        let patientsHtml = '';
        if (querySnapshot.empty) {
            patientsTableBody.innerHTML = '<tr><td colspan="4">No patients found.</td></tr>';
            return;
        }
        querySnapshot.forEach(doc => {
            const patient = doc.data();
            const uid = doc.id;
            patientsHtml += `
                <tr>
                    <td>${patient.username || '-'}</td>
                    <td>${patient.email || '-'}</td>
                    <td>${patient.phoneNumber || '-'}</td>
                    <td>
                        <button 
                            class="btn btn-primary btn-sm" 
                            data-bs-toggle="modal" 
                            data-bs-target="#editPatientModal" 
                            data-uid="${uid}" 
                            data-username="${patient.username || 'N/A'}"
                        >
                            Edit
                        </button>
                    </td>
                </tr>
            `;
        });
        patientsTableBody.innerHTML = patientsHtml;
    }, error => {
        console.error("Error fetching patients:", error);
        patientsTableBody.innerHTML = `<tr><td colspan="4" class="text-danger"><strong>Error:</strong> ${error.message}. <br><br>This usually means a Firestore index is required. Please check the browser's developer console for a link to create the index.</td></tr>`;
    });
};

// --- Patient Edit Functions (for patient_edit.html) ---
const handlePatientEditPage = () => {
    const patientDetailsContainer = document.getElementById('patient-details-container');
    if (!patientDetailsContainer) return;

    const urlParams = new URLSearchParams(window.location.search);
    const patientUid = urlParams.get('uid');
    if (!patientUid) {
        patientDetailsContainer.innerHTML = '<p class="text-danger">No patient UID provided.</p>';
        return;
    }

    const patientRef = db.collection('users').doc(patientUid);

    patientRef.onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            patientDetailsContainer.innerHTML = `<h2 class="fw-bold">${data.username || 'N/A'}</h2><p><strong>Email:</strong> ${data.email || 'N/A'}</p><p><strong>Phone:</strong> ${data.phoneNumber || 'N/A'}</p>`;
        } else {
            patientDetailsContainer.innerHTML = '<p class="text-danger">Patient not found.</p>';
        }
    });

    // --- Populate Medication Datalist ---
    const medicationDatalist = document.getElementById('medication-options');
    if (medicationDatalist) {
        db.collection('medications').orderBy('name').get().then(querySnapshot => {
            let optionsHtml = '';
            querySnapshot.forEach(doc => {
                const med = doc.data();
                optionsHtml += `<option value="${med.name}">`;
            });
            medicationDatalist.innerHTML = optionsHtml;
        }).catch(error => {
            console.error("Error fetching medications for datalist:", error);
        });
    }

    const bpForm = document.getElementById('add-bp-form');
    if(bpForm) {
        bpForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const systolic = Number(document.getElementById('bp-systolic').value);
            const diastolic = Number(document.getElementById('bp-diastolic').value);

            if (isNaN(systolic) || isNaN(diastolic) || systolic <= 0 || diastolic <= 0) {
                alert('Please enter valid systolic and diastolic blood pressure values.');
                return;
            }

            try {
                // 1. Add the new blood pressure record
                await patientRef.collection('blood_pressure').add({
                    systolic: systolic,
                    diastolic: diastolic,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp()
                });

                // 2. Query all blood pressure records, ordered by timestamp ascending
                const snapshot = await patientRef.collection('blood_pressure').orderBy('timestamp', 'asc').get();
                const records = snapshot.docs;

                // 3. If there are more than 7 records, delete the oldest ones
                if (records.length > 7) {
                    const recordsToDelete = records.slice(0, records.length - 7); // Get the oldest records to delete
                    const deletePromises = recordsToDelete.map(doc => doc.ref.delete());
                    await Promise.all(deletePromises);
                    console.log(`Deleted ${recordsToDelete.length} old blood pressure records.`);
                }

                bpForm.reset();
                alert('Blood pressure record added successfully!');

            } catch (error) {
                console.error("Error adding or trimming blood pressure record:", error);
                alert("Failed to add blood pressure record: " + error.message);
            }
        });
    }

    patientRef.collection('blood_pressure').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
        const bpHistory = document.getElementById('bp-history');
        if(!bpHistory) return;
        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            html += `<p>${data.timestamp ? data.timestamp.toDate().toLocaleString() : 'N/A'}: ${data.systolic}/${data.diastolic} mmHg</p>`;
        });
        bpHistory.innerHTML = html;
    });

    // --- Prescription Form Logic ---
    const prescriptionForm = document.getElementById('add-prescription-form');
    const frequencyInput = document.getElementById('prescription-frequency');
    const timeInputsContainer = document.getElementById('time-inputs-container');

    // Generate time inputs when frequency changes
    if (frequencyInput) {
        frequencyInput.addEventListener('input', () => {
            const count = parseInt(frequencyInput.value, 10);
            if(timeInputsContainer) timeInputsContainer.innerHTML = '';
            if (count > 0 && count <= 10) { // Limit to 10 to be safe
                for (let i = 1; i <= count; i++) {
                    const timeInputDiv = document.createElement('div');
                    timeInputDiv.classList.add('mb-2', 'row', 'align-items-center');
                    timeInputDiv.innerHTML = `
                        <label for="prescription-time-${i}" class="col-sm-2 col-form-label">Time ${i}</label>
                        <div class="col-sm-10">
                            <input type="time" class="form-control prescription-time-input" id="prescription-time-${i}">
                        </div>
                    `;
                    timeInputsContainer.appendChild(timeInputDiv);
                }
            }
        });
    }

    // Handle form submission
    if (prescriptionForm) {
        prescriptionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const frequency = parseInt(frequencyInput.value, 10);
            const times = [];
            if (frequency > 0) {
                for (let i = 1; i <= frequency; i++) {
                    const timeInput = document.getElementById(`prescription-time-${i}`);
                    if (timeInput && timeInput.value) {
                        times.push(timeInput.value);
                    }
                }
            }

            patientRef.collection('prescriptions').add({
                name: document.getElementById('prescription-name').value,
                dosage: document.getElementById('prescription-dosage').value,
                frequency: frequency,
                times: times, // Save array of times
                notes: document.getElementById('prescription-notes').value,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }).then(() => {
                prescriptionForm.reset();
                if(timeInputsContainer) timeInputsContainer.innerHTML = '';
            });
        });
    }

    // Display existing prescriptions
    patientRef.collection('prescriptions').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
        const prescriptionsHistory = document.getElementById('prescriptions-history');
        if(!prescriptionsHistory) return;

        let html = '';
        snapshot.forEach(doc => {
            const data = doc.data();
            const reminderTimes = data.times && data.times.length > 0 ? data.times.join(', ') : 'No specific times set';
            const reminderInfo = `<p class="card-text">Reminder: ${data.frequency || 'N/A'} times a day at ${reminderTimes}</p>`;
            html += `<div class="card mb-2"><div class="card-body"><h5 class="card-title">${data.name} (${data.dosage})</h5>${reminderInfo}<p class="card-text">${data.notes}</p><small class="text-muted">Prescribed on ${data.timestamp ? data.timestamp.toDate().toLocaleDateString() : 'N/A'}</small></div></div>`;
        });
        prescriptionsHistory.innerHTML = html;
    });
};

// --- Edupharma Page Functions (for edupharma.html) ---
const displayMedicationLibrary = () => {
    const container = document.getElementById('medication-list-container');
    if (!container) return;

    db.collection('medications').orderBy('name').onSnapshot(snapshot => {
        let html = '';
        if (snapshot.empty) {
            html = '<p class="text-center">No medications found in the library.</p>';
        } else {
            html += '<div class="accordion" id="medicationAccordion">';
            snapshot.forEach((doc, index) => {
                const med = doc.data();
                const medId = `med-${doc.id}`;
                html += `
                    <div class="accordion-item">
                        <h2 class="accordion-header" id="heading-${medId}">
                            <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${medId}" aria-expanded="false" aria-controls="collapse-${medId}">
                                <strong>${med.name}</strong>&nbsp;-&nbsp;<span class="text-muted">${med.type || 'N/A'}</span>
                            </button>
                        </h2>
                        <div id="collapse-${medId}" class="accordion-collapse collapse" aria-labelledby="heading-${medId}" data-bs-parent="#medicationAccordion">
                            <div class="accordion-body">
                                <p><strong>Dosage:</strong> ${med.dosage || 'N/A'}</p>
                                <p><strong>Description:</strong> ${med.description || 'No description available.'}</p>
                            </div>
                        </div>
                    </div>
                `;
            });
            html += '</div>';
        }
        container.innerHTML = html;
    }, error => {
        console.error("Error fetching medication library:", error);
        container.innerHTML = '<p class="text-danger text-center">Could not load medication library.</p>';
    });
};

// --- Healthy Dashboard Page Functions (for healthy_dashboard.html) ---
const displayHealthyDashboard = () => {
    const user = auth.currentUser;
    if (!user) return;

    const container = document.getElementById('health-tasks-container');
    if (!container) return;

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const userDailyTasksRef = db.collection('users').doc(user.uid).collection('daily_health_tasks').doc(today);

    const defaultTasks = {
        takeMedicine: false,
        exercise: false,
        reduceSalt: false,
        getEnoughSleep: false,
        dontSmoke: false
    };

    userDailyTasksRef.onSnapshot(docSnapshot => {
        if (!docSnapshot.exists) {
            // Document for today doesn't exist, create it
            userDailyTasksRef.set(defaultTasks).then(() => {
                renderTasks(defaultTasks); // Render with default
            }).catch(error => {
                console.error("Error creating daily tasks document:", error);
                container.innerHTML = '<p class="text-danger">Could not load tasks.</p>';
            });
        } else {
            // Document exists, render its current state
            const tasks = docSnapshot.data();
            renderTasks(tasks);
        }
    }, error => {
        console.error("Error fetching daily tasks:", error);
        container.innerHTML = '<p class="text-danger">Could not load tasks.</p>';
    });

    const renderTasks = (tasks) => {
        let html = '<ul class="list-group">';
        for (const [taskKey, taskStatus] of Object.entries(tasks)) {
            const taskLabel = taskKey.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()); // Convert camelCase to readable string
            html += `
                <li class="list-group-item d-flex justify-content-between align-items-center task-item ${taskStatus ? 'done' : ''}" data-task-key="${taskKey}">
                    ${taskLabel}
                    <i class="bi ${taskStatus ? 'bi-check-circle-fill text-success' : 'bi-circle text-muted'}"></i>
                </li>
            `;
        }
        html += '</ul>';
        container.innerHTML = html;

        // Attach event listeners for toggling tasks
        container.querySelectorAll('.task-item').forEach(item => {
            item.onclick = () => {
                const taskKey = item.getAttribute('data-task-key');
                const currentStatus = tasks[taskKey];
                userDailyTasksRef.update({
                    [taskKey]: !currentStatus
                }).catch(error => {
                    console.error("Error toggling task status:", error);
                    alert("Failed to update task status.");
                });
            };
        });
    };
};

// --- Medication Interaction Functions (for medication_interaction.html) ---
const displayMedicationInteraction = () => {
    const med1Select = document.getElementById('medication1-select');
    const med2Select = document.getElementById('medication2-select');
    const compareBtn = document.getElementById('compare-btn');
    const resultsDiv = document.getElementById('interaction-results');

    if (!med1Select || !med2Select || !compareBtn || !resultsDiv) return;

    let allMedications = []; // To store all fetched medications

    // Populate dropdowns
    db.collection('medications').orderBy('name').get().then(snapshot => {
        allMedications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        let optionsHtml = '<option value="">Select a medication</option>';
        allMedications.forEach(med => {
            optionsHtml += `<option value="${med.id}">${med.name}</option>`;
        });
        med1Select.innerHTML = optionsHtml;
        med2Select.innerHTML = optionsHtml;
    }).catch(error => {
        console.error("Error fetching medications for interaction check:", error);
        resultsDiv.innerHTML = '<div class="alert alert-danger">Error loading medications for comparison.</div>';
    });

    compareBtn.addEventListener('click', () => {
        const med1Id = med1Select.value;
        const med2Id = med2Select.value;

        if (!med1Id || !med2Id) {
            resultsDiv.innerHTML = '<div class="alert alert-warning">Please select two medications to compare.</div>';
            return;
        }
        if (med1Id === med2Id) {
            resultsDiv.innerHTML = '<div class="alert alert-warning">Please select two *different* medications to compare.</div>';
            return;
        }

        const med1 = allMedications.find(med => med.id === med1Id);
        const med2 = allMedications.find(med => med.id === med2Id);

        let interactionText = '';

        // Simplified interaction logic: Check if interaction field exists and if either medication lists the other
        const interactionFound = (med1 && med1.interactions && med1.interactions.some(i => i.withMedicationId === med2Id)) ||
                                 (med2 && med2.interactions && med2.interactions.some(i => i.withMedicationId === med1Id));
        
        if (interactionFound) {
            // This is a placeholder for more sophisticated interaction logic
            interactionText = `<div class="alert alert-danger"><strong>Potential Interaction!</strong> Please consult with your doctor or pharmacist.</div>`;
        } else {
            interactionText = `<div class="alert alert-success">No known interactions found between ${med1.name} and ${med2.name} in our database.</div>`;
        }

        resultsDiv.innerHTML = interactionText;
    });
};

// --- Medication Management Functions (for medication_management.html) ---
const resetMedicationForm = () => {
    const form = document.getElementById('add-medication-form');
    if(form) form.reset();
    const idInput = document.getElementById('medication-id-to-edit');
    if(idInput) idInput.value = '';
    const title = document.getElementById('add-medication-form-title');
    if(title) title.textContent = 'Add New Medication';
    const submitBtn = document.getElementById('add-medication-submit-btn');
    if(submitBtn) submitBtn.textContent = 'Add Medication';
    const cancelBtn = document.getElementById('cancel-edit-btn');
    if(cancelBtn) cancelBtn.style.display = 'none';
};

const editMedication = (medicationId) => {
    db.collection('medications').doc(medicationId).get().then(doc => {
        if (doc.exists) {
            const data = doc.data();
            document.getElementById('medication-name').value = data.name;
            document.getElementById('medication-description').value = data.description;
            document.getElementById('medication-type').value = data.type;
            document.getElementById('medication-dosage').value = data.dosage;
            document.getElementById('medication-id-to-edit').value = medicationId;
            document.getElementById('add-medication-form-title').textContent = 'Edit Medication';
            document.getElementById('add-medication-submit-btn').textContent = 'Update Medication';
            document.getElementById('cancel-edit-btn').style.display = 'inline-block';
            
            const addTabEl = document.getElementById('add-tab');
            if (addTabEl) {
                const addTab = new bootstrap.Tab(addTabEl);
                addTab.show();
            }
        } else {
            alert('Medication not found!');
            resetMedicationForm();
        }
    }).catch(error => {
        console.error("Error fetching medication for edit:", error);
        resetMedicationForm();
    });
};

const deleteMedication = (id) => {
    if (confirm('Are you sure you want to delete this medication?')) {
        db.collection('medications').doc(id).delete()
            .then(() => alert('Medication deleted successfully!'))
            .catch(error => {
                console.error("Error deleting medication:", error);
                alert("Error deleting medication: " + error.message);
            });
    }
};

const displayMedicationManagement = () => {
    const medicationsTableBody = document.getElementById('medications-table-body');
    if (!medicationsTableBody) return;

    db.collection('medications').orderBy('createdAt', 'desc').onSnapshot(querySnapshot => {
        if (querySnapshot.empty) {
            medicationsTableBody.innerHTML = '<tr><td colspan="5" class="text-center">No medications found.</td></tr>';
            return;
        }
        let medicationsHtml = '';
        querySnapshot.forEach(doc => {
            const med = doc.data();
            medicationsHtml += `
                <tr>
                    <td>${med.name || '-'}</td>
                    <td>${med.description || '-'}</td>
                    <td>${med.type || '-'}</td>
                    <td>${med.dosage || '-'}</td>
                    <td>
                        <button class="btn btn-warning btn-sm me-2" onclick="editMedication('${doc.id}')">Edit</button>
                        <button class="btn btn-danger btn-sm" onclick="deleteMedication('${doc.id}')">Delete</button>
                    </td>
                </tr>
            `;
        });
        medicationsTableBody.innerHTML = medicationsHtml;
    }, error => {
        console.error("Error fetching medications:", error);
        medicationsTableBody.innerHTML = `<tr><td colspan="5" class="text-danger">Error loading medications.</td></tr>`;
    });
};

// --- Main App Logic ---
document.addEventListener('DOMContentLoaded', () => {

    // --- DOM Element Variables ---
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const logoutButton = document.getElementById('logout-button');
    const googleSigninButton = document.getElementById('google-signin-button');
    const userDisplayName = document.getElementById('user-display-name');
    const userEmail = document.getElementById('user-email');
    const editProfileForm = document.getElementById('edit-profile-form');
    const addMedicationForm = document.getElementById('add-medication-form');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');

    // --- Patient List Page Modal Logic ---
    const editPatientModal = document.getElementById('editPatientModal');
    if (editPatientModal) {
        let bpFormSubmitHandler, prescriptionFormSubmitHandler, frequencyChangeHandler, savePrescriptionsHandler, removeTempPrescriptionHandler, clearPrescriptionsHandler;
        let bpSnapshotUnsubscribe, prescriptionSnapshotUnsubscribe;
        let tempPrescriptions = [];

        const renderTempPrescriptions = () => {
            const container = editPatientModal.querySelector('#modal-temp-prescriptions-list');
            if (!container) return;
            if (tempPrescriptions.length === 0) {
                container.innerHTML = '<p class="text-muted">No prescriptions added yet.</p>';
            } else {
                let html = '<ul class="list-group">';
                tempPrescriptions.forEach((p, index) => {
                    html += `<li class="list-group-item d-flex justify-content-between align-items-center">
                                ${p.name} (${p.dosage})
                                <button type="button" class="btn btn-danger btn-sm remove-temp-prescription-btn" data-index="${index}">Remove</button>
                             </li>`;
                });
                html += '</ul>';
                container.innerHTML = html;
            }
        };

        editPatientModal.addEventListener('show.bs.modal', (e) => {
            const button = e.relatedTarget;
            const patientUid = button.getAttribute('data-uid');
            const patientUsername = button.getAttribute('data-username');
            const patientRef = db.collection('users').doc(patientUid);

            tempPrescriptions = [];

            // --- Get Modal Elements ---
            const modalTitle = editPatientModal.querySelector('#modal-patient-name');
            const bpHistoryContainer = editPatientModal.querySelector('#modal-bp-history');
            const prescriptionsHistoryContainer = editPatientModal.querySelector('#modal-prescriptions-history');
            const bpForm = editPatientModal.querySelector('#modal-add-bp-form');
            const prescriptionForm = editPatientModal.querySelector('#modal-add-prescription-form');
            const frequencyInput = editPatientModal.querySelector('#modal-prescription-frequency');
            const timeInputsContainer = editPatientModal.querySelector('#modal-time-inputs-container');
            const medicationDatalist = editPatientModal.querySelector('#modal-medication-options');
            const savePrescriptionsBtn = editPatientModal.querySelector('#modal-save-prescriptions-btn');
            const tempPrescriptionsContainer = editPatientModal.querySelector('#modal-temp-prescriptions-list');
            const clearPrescriptionsBtn = editPatientModal.querySelector('#modal-clear-prescriptions-btn');

            // --- Reset UI ---
            modalTitle.textContent = patientUsername;
            bpHistoryContainer.innerHTML = '<p>Loading history...</p>';
            prescriptionsHistoryContainer.innerHTML = '<p>Loading history...</p>';
            renderTempPrescriptions();
            
            // --- Blood Pressure Logic ---
            bpSnapshotUnsubscribe = patientRef.collection('blood_pressure').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
                let html = '<ul class="list-group list-group-flush">';
                if (snapshot.empty) html = '<p>No blood pressure readings found.</p>';
                else {
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        html += `<li class="list-group-item d-flex justify-content-between align-items-center"><span><strong>${data.systolic}/${data.diastolic}</strong> mmHg</span><small>${data.timestamp ? data.timestamp.toDate().toLocaleString() : 'N/A'}</small></li>`;
                    });
                    html += '</ul>';
                }
                bpHistoryContainer.innerHTML = html;
            });

            bpFormSubmitHandler = async (submitEvent) => {
                submitEvent.preventDefault();
                const systolic = Number(document.getElementById('modal-bp-systolic').value);
                const diastolic = Number(document.getElementById('modal-bp-diastolic').value);
                if (isNaN(systolic) || isNaN(diastolic) || systolic <= 0 || diastolic <= 0) return alert('Please enter valid blood pressure values.');
                try {
                    await patientRef.collection('blood_pressure').add({ systolic, diastolic, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
                    const bpSnapshot = await patientRef.collection('blood_pressure').orderBy('timestamp', 'asc').get();
                    if (bpSnapshot.docs.length > 7) {
                        const recordsToDelete = bpSnapshot.docs.slice(0, bpSnapshot.docs.length - 7);
                        await Promise.all(recordsToDelete.map(doc => doc.ref.delete()));
                    }
                    bpForm.reset();
                } catch (error) { console.error("Error adding modal BP record:", error); }
            };

            // --- Prescription Logic ---
            prescriptionSnapshotUnsubscribe = patientRef.collection('prescriptions').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
                let html = '';
                if (snapshot.empty) html = '<p>No prescriptions found.</p>';
                else {
                    snapshot.forEach(doc => {
                        const data = doc.data();
                        const reminderTimes = data.times && data.times.length > 0 ? data.times.join(', ') : 'No specific times';
                        html += `<div class="card mb-2"><div class="card-body">
                                    <h5 class="card-title">${data.name} (${data.dosage})</h5>
                                    <p class="card-text">Reminder: ${data.frequency || 'N/A'} times a day. ${data.times && data.times.length > 0 ? `At ${reminderTimes}`: ''}</p>
                                    <p class="card-text"><small>${data.notes || ''}</small></p>
                                    <small class="text-muted">Prescribed on ${data.timestamp ? data.timestamp.toDate().toLocaleDateString() : 'N/A'}</small>
                                 </div></div>`;
                    });
                }
                prescriptionsHistoryContainer.innerHTML = html;
            });

            db.collection('medications').orderBy('name').get().then(querySnapshot => {
                let optionsHtml = '';
                querySnapshot.forEach(doc => { optionsHtml += `<option value="${doc.data().name}">`; });
                medicationDatalist.innerHTML = optionsHtml;
            });

            frequencyChangeHandler = () => {
                const count = parseInt(frequencyInput.value, 10);
                timeInputsContainer.innerHTML = '';
                if (count > 0 && count <= 10) {
                    for (let i = 1; i <= count; i++) {
                        const timeInputDiv = document.createElement('div');
                        timeInputDiv.classList.add('mb-2', 'row', 'align-items-center');
                        timeInputDiv.innerHTML = `<label for="modal-prescription-time-${i}" class="col-sm-3 col-form-label">Time ${i}</label>
                                                 <div class="col-sm-9"><input type="time" class="form-control" id="modal-prescription-time-${i}"></div>`;
                        timeInputsContainer.appendChild(timeInputDiv);
                    }
                }
            };

            prescriptionFormSubmitHandler = (e) => {
                e.preventDefault();
                const newPrescription = {
                    name: document.getElementById('modal-prescription-name').value,
                    dosage: document.getElementById('modal-prescription-dosage').value,
                    frequency: parseInt(frequencyInput.value, 10) || 0,
                    times: Array.from(timeInputsContainer.querySelectorAll('input')).map(input => input.value).filter(Boolean),
                    notes: document.getElementById('modal-prescription-notes').value,
                };
                if (!newPrescription.name || !newPrescription.dosage) return alert('Please fill out Medication Name and Dosage.');
                tempPrescriptions.push(newPrescription);
                renderTempPrescriptions();
                alert(`"${newPrescription.name}" added to pending list.`);
                prescriptionForm.reset();
                timeInputsContainer.innerHTML = '';
            };
            
            removeTempPrescriptionHandler = (e) => {
                if (e.target.classList.contains('remove-temp-prescription-btn')) {
                    const index = parseInt(e.target.getAttribute('data-index'), 10);
                    tempPrescriptions.splice(index, 1);
                    renderTempPrescriptions();
                }
            };

            savePrescriptionsHandler = () => {
                if (tempPrescriptions.length === 0) return alert('No pending prescriptions to save.');
                const batch = db.batch();
                tempPrescriptions.forEach(prescription => {
                    const newPrescriptionRef = patientRef.collection('prescriptions').doc();
                    batch.set(newPrescriptionRef, { ...prescription, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
                });
                batch.commit().then(() => {
                    alert('All prescriptions saved successfully!');
                    tempPrescriptions = [];
                    renderTempPrescriptions();
                }).catch(error => { console.error('Error saving prescriptions in batch:', error); alert('Failed to save prescriptions.'); });
            };

            clearPrescriptionsHandler = () => {
                if (!confirm('Are you sure you want to delete all prescription history for this patient? This action cannot be undone.')) return;
                patientRef.collection('prescriptions').get().then(snapshot => {
                    if (snapshot.empty) return alert('There is no history to clear.');
                    const batch = db.batch();
                    snapshot.docs.forEach(doc => { batch.delete(doc.ref); });
                    return batch.commit();
                }).then(() => {
                    alert('Prescription history cleared successfully.');
                }).catch(error => { console.error('Error clearing prescription history:', error); alert('Failed to clear prescription history.'); });
            };

            // --- Attach Event Listeners ---
            bpForm.addEventListener('submit', bpFormSubmitHandler);
            frequencyInput.addEventListener('input', frequencyChangeHandler);
            prescriptionForm.addEventListener('submit', prescriptionFormSubmitHandler);
            tempPrescriptionsContainer.addEventListener('click', removeTempPrescriptionHandler);
            savePrescriptionsBtn.addEventListener('click', savePrescriptionsHandler);
            clearPrescriptionsBtn.addEventListener('click', clearPrescriptionsHandler);
        });

        editPatientModal.addEventListener('hide.bs.modal', () => {
            if (bpSnapshotUnsubscribe) bpSnapshotUnsubscribe();
            if (prescriptionSnapshotUnsubscribe) prescriptionSnapshotUnsubscribe();
            
            const bpForm = editPatientModal.querySelector('#modal-add-bp-form');
            if (bpForm && bpFormSubmitHandler) bpForm.removeEventListener('submit', bpFormSubmitHandler);
            
            const prescriptionForm = editPatientModal.querySelector('#modal-add-prescription-form');
            if (prescriptionForm && prescriptionFormSubmitHandler) prescriptionForm.removeEventListener('submit', prescriptionFormSubmitHandler);
            
            const frequencyInput = editPatientModal.querySelector('#modal-prescription-frequency');
            if (frequencyInput && frequencyChangeHandler) frequencyInput.removeEventListener('input', frequencyChangeHandler);

            const tempPrescriptionsContainer = editPatientModal.querySelector('#modal-temp-prescriptions-list');
            if (tempPrescriptionsContainer && removeTempPrescriptionHandler) tempPrescriptionsContainer.removeEventListener('click', removeTempPrescriptionHandler);

            const savePrescriptionsBtn = editPatientModal.querySelector('#modal-save-prescriptions-btn');
            if (savePrescriptionsBtn && savePrescriptionsHandler) savePrescriptionsBtn.removeEventListener('click', savePrescriptionsHandler);

            const clearPrescriptionsBtn = editPatientModal.querySelector('#modal-clear-prescriptions-btn');
            if (clearPrescriptionsBtn && clearPrescriptionsHandler) clearPrescriptionsBtn.removeEventListener('click', clearPrescriptionsHandler);
        });
    }

    // --- Main Auth State Listener ---
    auth.onAuthStateChanged(async (user) => {
        const pathname = window.location.pathname;
        const onPage = (page) => pathname.endsWith(`/${page}.html`) || pathname.endsWith(`/${page}`);

        const isAuthPage = onPage('Login') || onPage('Sign_Up');
        const isMainPage = onPage('main');
        const isAdminPage = onPage('dashboard');
        const isDoctorPage = onPage('doctor_dashboard');
        const isPatientListPage = onPage('patient_list');
        const isPatientEditPage = onPage('patient_edit');
        const isMedicationPage = onPage('medication_management');
        const isMyPrescriptionsPage = onPage('my_prescriptions');
        const isBPHistoryPage = onPage('blood_pressure_history');
        const isEdupharmaPage = onPage('edupharma');
        const isHealthyDashboardPage = onPage('healthy_dashboard');
        const isMedicationInteractionPage = onPage('medication_interaction');

        if (user) {
            try {
                const userDoc = await db.collection('users').doc(user.uid).get();
                let role = 'user'; // Default role
                if (userDoc.exists) {
                    const data = userDoc.data();
                    if (data && data.role) {
                        role = data.role;
                    }
                }

                if (isAuthPage) {
                    if (role === 'admin') return window.location.assign('/dashboard.html');
                    if (role === 'doctor') return window.location.assign('/doctor_dashboard.html');
                    // For 'patient' or any other role, redirect to main.
                    return window.location.assign('/main.html');
                }
                
                if (userEmail) userEmail.textContent = user.email;

                if (isAdminPage && role === 'admin') displayAdminDashboard();
                else if (isPatientListPage && role === 'doctor') displayPatientList();
                else if (isPatientEditPage && role === 'doctor') handlePatientEditPage();
                else if (isMedicationPage && role === 'doctor') displayMedicationManagement();
                else if (isEdupharmaPage) displayMedicationLibrary();
                else if (isHealthyDashboardPage) displayHealthyDashboard();
                else if (isMedicationInteractionPage) displayMedicationInteraction();
                else if ((isMainPage || isMyPrescriptionsPage || isBPHistoryPage) && (role === 'user' || role === 'patient')) displayUserData(user);

            } catch (error) {
                console.error("Error during auth state change, signing out:", error);
                auth.signOut();
            }
        } else { // User is logged out
            if (!isAuthPage) {
                window.location.assign('/Login.html');
            }
        }
    });

    // --- Event Listeners ---
    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('register-username').value;
            const email = document.getElementById('register-email').value;
            const phone = document.getElementById('register-phone').value;
            const password = document.getElementById('register-password').value;

            auth.createUserWithEmailAndPassword(email, password)
                .then(cred => {
                    const user = cred.user;
                    // Create an array of promises for all the setup tasks
                    const setupPromises = [
                        // 1. Update the user's auth profile
                        user.updateProfile({ displayName: username }),
                        // 2. Create the user's document in Firestore
                        db.collection('users').doc(user.uid).set({
                            username: username,
                            email: email,
                            phoneNumber: phone,
                            role: 'patient'
                        })
                    ];
                    // Wait for all setup tasks to complete
                    return Promise.all(setupPromises);
                })
                .then(() => {
                    registerForm.reset();
                    // The onAuthStateChanged listener will handle the redirect
                })
                .catch(err => {
                    console.error("Error during registration:", err);
                    alert("Registration failed: " + err.message);
                });
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            auth.signInWithEmailAndPassword(email, password)
                .then(() => loginForm.reset())
                .catch(err => alert(err.message));
        });
    }

    if (logoutButton) logoutButton.addEventListener('click', () => auth.signOut());
    if (googleSigninButton) googleSigninButton.addEventListener('click', signInWithGoogle);
    
    if (editProfileForm) {
        editProfileForm.addEventListener('submit', (e) => {
            e.preventDefault();
            // This form is not fully implemented in the provided files, but the logic is here
        });
    }

    if (addMedicationForm) {
        addMedicationForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const medicationId = document.getElementById('medication-id-to-edit').value;
            const medicationData = {
                name: document.getElementById('medication-name').value,
                description: document.getElementById('medication-description').value,
                type: document.getElementById('medication-type').value,
                dosage: document.getElementById('medication-dosage').value,
            };

            let promise;
            if (medicationId) {
                // Update existing medication
                promise = db.collection('medications').doc(medicationId).update(medicationData);
            } else {
                // Add new medication
                promise = db.collection('medications').add({ ...medicationData, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
            }

            promise.then(() => {
                alert(`Medication ${medicationId ? 'updated' : 'added'} successfully!`);
                resetMedicationForm();
            })
            .catch(error => {
                console.error("Error saving medication:", error);
                alert("Error saving medication: " + error.message);
            });
        });
    }

    if (cancelEditBtn) {
        cancelEditBtn.addEventListener('click', resetMedicationForm);
    }
});