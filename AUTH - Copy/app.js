// Initialize Firebase Services
const db = firebase.firestore();
const auth = firebase.auth();

// DOM Elements
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const logoutButton = document.getElementById('logout-button');
const googleSigninButton = document.getElementById('google-signin-button');
const userDisplayName = document.getElementById('user-display-name');
const userEmail = document.getElementById('user-email');
const usersTableBody = document.getElementById('users-table-body');
const editProfileForm = document.getElementById('edit-profile-form');
const editUsernameInput = document.getElementById('edit-username');
const editPhoneInput = document.getElementById('edit-phone');

// --- Firebase Auth Providers ---
const googleProvider = new firebase.auth.GoogleAuthProvider();

// --- Helper Functions (for main.html) ---
const displayUserData = (user) => {
    if (!user || !usersTableBody) return;
    const docRef = db.collection('users').doc(user.uid);
    docRef.onSnapshot(doc => {
        let userData = {};
        if (doc.exists) userData = doc.data();
        
        const displayUsername = userData.username || user.displayName || '-';
        const displayEmail = userData.email || user.email || '-';
        const displayPhone = userData.phoneNumber || '-';
        
        if (userDisplayName) userDisplayName.textContent = displayUsername;
        if (userEmail) userEmail.textContent = displayEmail;
        if (editUsernameInput) editUsernameInput.value = displayUsername;
        if (editPhoneInput) editPhoneInput.value = userData.phoneNumber || '';

        usersTableBody.innerHTML = `
            <tr>
                <td>${displayUsername}</td>
                <td>${displayEmail}</td>
                <td>${displayPhone}</td>
            </tr>
        `;
    }, error => console.error("Error fetching user data:", error));
};

// --- Helper Functions (for dashboard.html) ---
const displayAdminDashboard = () => {
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
                            <option value="user" ${currentRole === 'user' ? 'selected' : ''}>user</option>
                            <option value="admin" ${currentRole === 'admin' ? 'selected' : ''}>admin</option>
                        </select>
                    </td>
                </tr>
            `;
        });
        usersTableBody.innerHTML = usersHtml;
        
        // Add event listeners to the new select elements
        document.querySelectorAll('.role-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const newRole = e.target.value;
                const targetUid = e.target.dataset.uid;
                if (confirm(`Are you sure you want to change this user's role to ${newRole}?`)) {
                    updateUserRole(targetUid, newRole);
                } else {
                    // Reset dropdown if cancelled
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
                if (!doc.exists) {
                    return userDocRef.set({
                        username: user.displayName,
                        email: user.email,
                        phoneNumber: user.phoneNumber || '',
                        role: 'user' // Default role
                    });
                }
            });
        })
        .catch(error => console.error("Error during Google sign-in:", error));
};

const updateUserProfile = (e) => {
    e.preventDefault();
    const user = auth.currentUser;
    if (!user) return;
    const newUsername = editUsernameInput.value;
    const newPhone = editPhoneInput.value;
    
    Promise.all([
        user.updateProfile({ displayName: newUsername }),
        db.collection('users').doc(user.uid).set({
            username: newUsername,
            phoneNumber: newPhone
        }, { merge: true })
    ])
    .then(() => alert("Profile updated successfully!"))
    .catch(error => alert("Error updating profile: " + error.message));
};

// --- Main Auth State Listener ---
auth.onAuthStateChanged(async (user) => {
    const pathname = window.location.pathname;
    const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup');
    const isMainPage = pathname.startsWith('/main');
    const isAdminPage = pathname.startsWith('/dashboard');

    if (user) {
        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            const userData = userDoc.exists ? userDoc.data() : {};
            const role = userData.role || 'user';
            
            if (role === 'admin') {
                if (!isAdminPage) window.location.href = '/dashboard.html';
                else {
                    if(userEmail) userEmail.textContent = user.email;
                    displayAdminDashboard();
                }
            } else { // Regular 'user'
                if (!isMainPage) window.location.href = '/main.html';
                else displayUserData(user);
            }
        } catch (error) {
            console.error("Error getting user role, defaulting to user view:", error);
            if (!isMainPage) window.location.href = '/main.html'; // Default to user view on error
            else displayUserData(user);

        }
    } else { // User is logged out
        if (!isAuthPage) {
            window.location.href = '/login.html';
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
            .then(cred => cred.user.updateProfile({ displayName: username })
                .then(() => db.collection('users').doc(cred.user.uid).set({
                    username: username,
                    email: email,
                    phoneNumber: phone,
                    role: 'user' // Default role
                }))
            )
            .then(() => registerForm.reset())
            .catch(err => alert(err.message));
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
if (editProfileForm) editProfileForm.addEventListener('submit', updateUserProfile);