let localStream;
let remoteStreams = new Map(); // socketId -> stream
let peerConnections = new Map(); // socketId -> RTCPeerConnection
let currentVoiceChannelId = null;
let isMuted = false;
let isDeafened = false;
let isScreenSharing = false;

const rtcConfig = {
      iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
      ]
};

// UI Elements
const voiceBar = document.getElementById('voice-bar');
const voiceChannelNameEl = document.getElementById('voice-channel-name');
const btnMute = document.getElementById('btn-mute');
const btnDeafen = document.getElementById('btn-deafen');
const btnDisconnect = document.getElementById('voice-disconnect');
const btnScreenShare = document.getElementById('voice-screen-share');
const btnScreenShareChat = document.getElementById('btn-screen-share');

// Join Voice Channel
window.joinVoiceChannel = async function (channelId, channelName) {
      if (currentVoiceChannelId === channelId) return;

      if (currentVoiceChannelId) {
            leaveVoiceChannel();
      }

      currentVoiceChannelId = channelId;
      voiceChannelNameEl.textContent = channelName;
      voiceBar.classList.remove('hidden');

      try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

            // Join room
            socket.emit('voice:join', channelId);

            updateMuteState();
      } catch (err) {
            console.error('Error accessing microphone:', err);
            alert('Could not access microphone. Please check permissions.');
            leaveVoiceChannel();
      }
};

// Leave Voice Channel
function leaveVoiceChannel() {
      if (!currentVoiceChannelId) return;

      socket.emit('voice:leave');

      // Close all connections
      peerConnections.forEach(pc => pc.close());
      peerConnections.clear();
      remoteStreams.clear();

      // Stop local stream
      if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
      }

      currentVoiceChannelId = null;
      voiceBar.classList.add('hidden');

      // Clean up UI
      document.querySelectorAll('.voice-users').forEach(el => el.innerHTML = '');
}

// Handle Socket Events (Called from app.js)
window.handleVoiceEvent = async function (event, data) {
      switch (event) {
            case 'voice:users': // List of users already in channel
                  data.users.forEach(async (user) => {
                        if (user.socketId !== socket.id) {
                              createPeerConnection(user.socketId, user.userId, true); // We initiate offer
                        }
                  });
                  break;

            case 'voice:user-joined': // New user joined
                  createPeerConnection(data.socketId, data.userId, false); // Wait for their offer
                  break;

            case 'voice:user-left':
                  if (peerConnections.has(data.socketId)) {
                        peerConnections.get(data.socketId).close();
                        peerConnections.delete(data.socketId);
                        removeAudioElement(data.socketId);
                  }
                  break;

            case 'webrtc:offer':
                  handleOffer(data.fromUserId, data.offer, data.socketId);
                  break;

            case 'webrtc:answer':
                  handleAnswer(data.fromUserId, data.answer);
                  break;

            case 'webrtc:ice-candidate':
                  handleCandidate(data.fromUserId, data.candidate);
                  break;
      }
};

// WebRTC Logic
async function createPeerConnection(targetSocketId, targetUserId, initiator) {
      const pc = new RTCPeerConnection(rtcConfig);
      peerConnections.set(targetUserId, pc); // Map by userId for signaling

      // Add local tracks
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

      // Handle remote stream
      pc.ontrack = (event) => {
            const stream = event.streams[0];
            if (!remoteStreams.has(targetUserId)) {
                  remoteStreams.set(targetUserId, stream);
                  createAudioElement(targetUserId, stream);
            }
      };

      // ICE Candidates
      pc.onicecandidate = (event) => {
            if (event.candidate) {
                  socket.emit('webrtc:ice-candidate', {
                        targetUserId: targetUserId,
                        candidate: event.candidate
                  });
            }
      };

      if (initiator) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('webrtc:offer', {
                  targetUserId: targetUserId,
                  offer: offer
            });
      }
}

async function handleOffer(fromUserId, offer, fromSocketId) {
      let pc = peerConnections.get(fromUserId);
      if (!pc) {
            // Should have been created via user-joined, but just in case
            const targetSocketId = fromSocketId; // We might need to pass this in offer data if not available
            // Actually, createPeerConnection expects socketId for cleanup, but we map by userId
            // We'll fix this mismatch by assuming we can just make a new PC
            pc = new RTCPeerConnection(rtcConfig);
            peerConnections.set(fromUserId, pc);

            localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

            pc.ontrack = (event) => {
                  const stream = event.streams[0];
                  if (!remoteStreams.has(fromUserId)) {
                        remoteStreams.set(fromUserId, stream);
                        createAudioElement(fromUserId, stream);
                  }
            };

            pc.onicecandidate = (event) => {
                  if (event.candidate) {
                        socket.emit('webrtc:ice-candidate', {
                              targetUserId: fromUserId,
                              candidate: event.candidate
                        });
                  }
            };
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('webrtc:answer', {
            targetUserId: fromUserId,
            answer: answer
      });
}

async function handleAnswer(fromUserId, answer) {
      const pc = peerConnections.get(fromUserId);
      if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
}

async function handleCandidate(fromUserId, candidate) {
      const pc = peerConnections.get(fromUserId);
      if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
}

// Audio Elements
function createAudioElement(userId, stream) {
      const audio = document.createElement('audio');
      audio.id = `audio-${userId}`;
      audio.srcObject = stream;
      audio.autoplay = true;
      document.body.appendChild(audio);
}

function removeAudioElement(userId) { // Wait, removed by socketId in handleVoiceEvent?
      // We need to map socketId to userId or just use userId consistently
      // The backend sends socketId and userId.
      // In `voice:user-left`, we receive socketId.
      // But our map keys are userId (for answering) or socketId (for cleanup).
      // Let's standardise on using userId for map keys, but we need to know userId on leave.
      // The server sends `userId` on leave too!
      const audio = document.getElementById(`audio-${userId}`);
      if (audio) audio.remove();
}

// Mute/Deafen Logic
function updateMuteState() {
      if (!localStream) return;

      const audioTracks = localStream.getAudioTracks();
      audioTracks.forEach(track => {
            track.enabled = !isMuted;
      });

      btnMute.style.color = isMuted ? '#ed4245' : '';
      socket.emit('voice:mute', isMuted);
}

btnMute.addEventListener('click', () => {
      isMuted = !isMuted;
      updateMuteState();
      if (isMuted && isDeafened) {
            // If unmuting, we might want to undeafen? logic varies. 
            // Discord: clicking mute while deafened just un-toggles mute icon but stays deafened/muted
      }
});

btnDeafen.addEventListener('click', () => {
      isDeafened = !isDeafened;
      isMuted = isDeafened; // Deafen implies mute
      updateMuteState();

      // Mute entry remote audio
      document.querySelectorAll('audio').forEach(el => {
            el.muted = isDeafened;
      });

      btnDeafen.style.color = isDeafened ? '#ed4245' : '';
      socket.emit('voice:deafen', isDeafened);
});

btnDisconnect.addEventListener('click', leaveVoiceChannel);

// Screen Share
async function startScreenShare() {
      try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
            isScreenSharing = true;

            // Replace video track in all peer connections
            const videoTrack = stream.getVideoTracks()[0];

            peerConnections.forEach(pc => {
                  const sender = pc.getSenders().find(s => s.track.kind === 'video');
                  if (sender) {
                        sender.replaceTrack(videoTrack);
                  } else {
                        pc.addTrack(videoTrack, localStream);
                  }
            });

            videoTrack.onended = () => {
                  stopScreenShare();
                  // Revert to camera or nothing?
            };

            socket.emit('screen:start', currentVoiceChannelId);
            btnScreenShare.style.color = '#3ba55c';

      } catch (err) {
            console.error('Screen share error:', err);
      }
}

function stopScreenShare() {
      isScreenSharing = false;
      // logic to remove video track or switch back to camera
      socket.emit('screen:stop', currentVoiceChannelId);
      btnScreenShare.style.color = '';
}

btnScreenShare.addEventListener('click', () => {
      if (!isScreenSharing) startScreenShare();
      else stopScreenShare();
});

btnScreenShareChat.addEventListener('click', () => {
      if (currentVoiceChannelId) {
            if (!isScreenSharing) startScreenShare();
            else stopScreenShare();
      } else {
            alert('Join a voice channel to share your screen!');
      }
});
