// Elements
const settingsModal = document.getElementById('settings-modal');
const settingsBtn = document.getElementById('btn-settings'); // in user panel
const serverSettingsBtn = document.getElementById('server-settings-btn'); // in channel header
const settingsCloseBtn = document.getElementById('settings-close');
const settingsNavs = document.querySelectorAll('.settings-nav');
const settingsSections = document.querySelectorAll('.settings-section');
const logoutBtn = document.getElementById('settings-logout');

// Open/Close
settingsBtn.addEventListener('click', () => {
      openSettings('account');
});

serverSettingsBtn.addEventListener('click', () => {
      // Logic for server settings if we had it, but for now open user settings or alert
      alert('Server settings are not implemented yet!');
});

settingsCloseBtn.addEventListener('click', () => {
      settingsModal.classList.add('hidden');
});

// Navigation
settingsNavs.forEach(nav => {
      nav.addEventListener('click', () => {
            if (nav.id === 'settings-logout') return;

            // Remove active class from all navs
            settingsNavs.forEach(n => n.classList.remove('active'));
            // Add to clicked
            nav.classList.add('active');

            // Hide all sections
            settingsSections.forEach(s => s.classList.remove('active'));
            // Show target section
            const sectionId = nav.dataset.section;
            document.getElementById(`section-${sectionId}`).classList.add('active');
      });
});

function openSettings(section) {
      settingsModal.classList.remove('hidden');
      // Trigger click on nav
      const nav = document.querySelector(`.settings-nav[data-section="${section}"]`);
      if (nav) nav.click();

      // Load current user data
      if (window.currentUser) {
            document.getElementById('settings-username').textContent = window.currentUser.username;
            document.getElementById('settings-email').textContent = window.currentUser.email;
            const avatar = window.currentUser.avatar;
            const letter = document.getElementById('settings-avatar-letter');
            if (avatar) {
                  letter.style.backgroundImage = `url(${avatar})`;
                  letter.textContent = '';
            } else {
                  letter.style.backgroundImage = 'none';
                  letter.textContent = window.currentUser.username.charAt(0).toUpperCase();
            }
      }
}

// Edit Profile
const btnEditProfile = document.getElementById('btn-edit-profile');
const editProfileForm = document.getElementById('edit-profile-form');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const btnSaveProfile = document.getElementById('btn-save-profile');

btnEditProfile.addEventListener('click', () => {
      editProfileForm.classList.remove('hidden');
      document.getElementById('settings-username-input').value = window.currentUser.username;
      document.getElementById('settings-status-input').value = window.currentUser.custom_status || '';
});

btnCancelEdit.addEventListener('click', () => {
      editProfileForm.classList.add('hidden');
});

btnSaveProfile.addEventListener('click', async () => {
      const username = document.getElementById('settings-username-input').value.trim();
      const customStatus = document.getElementById('settings-status-input').value.trim();

      try {
            const res = await fetch('/api/users/profile', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ username, custom_status: customStatus })
            });

            const data = await res.json();
            if (res.ok) {
                  window.currentUser = data.user;
                  editProfileForm.classList.add('hidden');
                  openSettings('account'); // Reload UI

                  // Update sidebar
                  document.getElementById('user-name').textContent = data.user.username;
                  document.getElementById('user-tag').textContent = data.user.custom_status || 'Online';

                  alert('Profile updated!');
            } else {
                  alert(data.error || 'Update failed');
            }
      } catch (err) {
            console.error(err);
            alert('Network error');
      }
});

// Change Password
const btnChangePassword = document.getElementById('btn-change-password');
btnChangePassword.addEventListener('click', async () => {
      const currentPassword = document.getElementById('current-password-input').value;
      const newPassword = document.getElementById('new-password-input').value;

      if (!currentPassword || !newPassword) {
            return alert('Please fill in both fields');
      }

      try {
            const res = await fetch('/api/users/change-password', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ currentPassword, newPassword })
            });

            if (res.ok) {
                  alert('Password changed successfully');
                  document.getElementById('current-password-input').value = '';
                  document.getElementById('new-password-input').value = '';
            } else {
                  const data = await res.json();
                  alert(data.error || 'Failed to change password');
            }
      } catch (err) {
            console.error(err);
            alert('Network error');
      }
});

// Logout
logoutBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to log out?')) return;

      try {
            await fetch('/api/auth/logout', { method: 'POST' });
            window.location.reload();
      } catch (err) {
            console.error(err);
            window.location.reload();
      }
});

// Audio Settings
const inputSelect = document.getElementById('audio-input-select');
const outputSelect = document.getElementById('audio-output-select');

async function loadAudioDevices() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;

      try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            inputSelect.innerHTML = '';
            outputSelect.innerHTML = '';

            devices.forEach(device => {
                  const option = document.createElement('option');
                  option.value = device.deviceId;
                  option.textContent = device.label || `${device.kind} - ${device.deviceId.substring(0, 5)}...`;

                  if (device.kind === 'audioinput') {
                        inputSelect.appendChild(option);
                  } else if (device.kind === 'audiooutput') {
                        outputSelect.appendChild(option);
                  }
            });

            if (inputSelect.options.length === 0) {
                  const op = document.createElement('option');
                  op.text = 'Default Microphone';
                  inputSelect.add(op);
            }
            if (outputSelect.options.length === 0) {
                  const op = document.createElement('option');
                  op.text = 'Default Spracker'; // 'Speaker' typofix if desired but 'Default' is fine
                  op.text = 'Default Speaker';
                  outputSelect.add(op);
            }

      } catch (err) {
            console.error('Error loading audio devices:', err);
      }
}

// Volume Sliders
const inputVolume = document.getElementById('input-volume');
const outputVolume = document.getElementById('output-volume');

inputVolume.addEventListener('input', (e) => {
      // TODO: Apply gain to localStream audio track
      // This requires Web Audio API processing which is complex for this scope
      // For now just console log
      console.log('Input volume set to:', e.target.value);
});

outputVolume.addEventListener('input', (e) => {
      // Apply volume to all remote audio elements
      const volume = e.target.value / 100;
      document.querySelectorAll('audio').forEach(audio => {
            audio.volume = volume;
      });
});

// Theme Toggle
const themeInputs = document.querySelectorAll('input[name="theme"]');
themeInputs.forEach(input => {
      input.addEventListener('change', (e) => {
            if (e.target.checked) {
                  document.documentElement.setAttribute('data-theme', e.target.value);
            }
      });
});

// Initial Load
loadAudioDevices();
navigator.mediaDevices.addEventListener('devicechange', loadAudioDevices);
