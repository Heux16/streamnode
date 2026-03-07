/**
 * StreamNode Mobile
 *
 * Tab 1 – My Server : shows local HTTP server status & mDNS advertising
 * Tab 2 – Browse    : discover LAN devices → browse files → play videos
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  Image,
  TouchableOpacity,
  FlatList,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
  Linking,
  BackHandler,
  TextInput,
  Dimensions,
  Animated,
  PanResponder,
} from 'react-native';
import nodejs from 'nodejs-mobile-react-native';
import Video from 'react-native-video';

// Per-session token registry  { [deviceUrl]: jwtToken }
// Survives re-renders; cleared on app restart (acceptable for LAN use).
const tokenStore = {};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TABS = { SERVER: 'server', BROWSE: 'browse' };

const STATUS = {
  STARTING: 'starting',
  RUNNING:  'running',
  STOPPED:  'stopped',
  ERROR:    'error',
};

const TYPE_ICONS = {
  folder: '📁',
  video:  '🎬',
  audio:  '🎵',
  image:  '🖼️',
  pdf:    '📕',
  text:   '📄',
  file:   '📦',
};

// ─────────────────────────────────────────────────────────────────────────────
// Permissions
// ─────────────────────────────────────────────────────────────────────────────

async function requestStoragePermissions() {
  if (Platform.OS !== 'android') return true;
  if (Platform.Version >= 33) {
    const grants = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
      PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
      PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO,
    ]);
    return Object.values(grants).every(v => v === PermissionsAndroid.RESULTS.GRANTED);
  }
  const r = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
  );
  return r === PermissionsAndroid.RESULTS.GRANTED;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function buildStreamUrl(device, file, folderPath, token) {
  const parts = [];
  if (folderPath != null) parts.push('path=' + encodeURIComponent(folderPath));
  if (token)              parts.push('token=' + encodeURIComponent(token));
  const name = encodeURIComponent(file.name);
  return device.url + '/stream/' + name + (parts.length ? '?' + parts.join('&') : '');
}

async function fetchFiles(deviceUrl, path, token) {
  const url = path != null
    ? deviceUrl + '/files?path=' + encodeURIComponent(path)
    : deviceUrl + '/files';
  const headers = token ? { Authorization: 'Bearer ' + token } : {};
  const res = await fetch(url, { headers });
  if (res.status === 401) throw new Error('UNAUTHORIZED');
  if (!res.ok)            throw new Error('HTTP ' + res.status);
  return res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Root App
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab]                     = useState(TABS.SERVER);
  const [serverStatus, setServerStatus]   = useState(STATUS.STARTING);
  const [serverIP, setServerIP]           = useState('—');
  const [serverPort, setServerPort]       = useState(9000);
  const [advertising, setAdvertising]     = useState(false);
  const [errorMsg, setErrorMsg]           = useState('');
  const [permissionsOk, setPermissionsOk] = useState(false);
  const [nodeStarted, setNodeStarted]     = useState(false);
  const [incomingPairCode, setIncomingPairCode] = useState(null); // code shown when a device pairs to THIS phone
  const [trustedDevices, setTrustedDevices]     = useState([]); // devices that have paired with this phone

  // Start Node.js once
  useEffect(() => {
    nodejs.start('main.js');
    setNodeStarted(true);
  }, []);

  // Bridge listener for server-tab messages
  useEffect(() => {
    const listener = nodejs.channel.addListener('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.type === 'SERVER_STARTED') {
          setServerIP(data.ip || '—');
          setServerPort(data.port || 9000);
          setServerStatus(STATUS.RUNNING);
          setAdvertising(true);
        } else if (data.type === 'SERVER_ERROR') {
          setServerStatus(STATUS.ERROR);
          setErrorMsg(data.message || 'Unknown error');
        } else if (data.type === 'STATUS') {
          setServerIP(data.ip || '—');
          setServerPort(data.port || 9000);
          setAdvertising(data.advertising || false);
        } else if (data.type === 'ADVERTISE_ON_ACK')  setAdvertising(true);
        else if (data.type === 'ADVERTISE_OFF_ACK') setAdvertising(false);
        else if (data.type === 'SERVER_STOPPED')    setServerStatus(STATUS.STOPPED);
        else if (data.type === 'PAIR_CODE_REQUESTED') setIncomingPairCode(data.code);
        else if (data.type === 'DEVICE_PAIRED') {
          setIncomingPairCode(null);
          nodejs.channel.send(JSON.stringify({ type: 'GET_TRUSTED_DEVICES' }));
        }
        else if (data.type === 'TRUSTED_DEVICES') setTrustedDevices(data.devices || []);
        else if (data.type === 'DEVICE_REVOKED') {
          setTrustedDevices(prev => prev.filter(d => d.deviceName !== data.name));
        }
      } catch (_) {}
    });
    return () => listener.remove();
  }, []);

  // Permissions
  useEffect(() => {
    requestStoragePermissions().then(ok => {
      setPermissionsOk(ok);
      if (!ok) Alert.alert('Permission Required', 'Grant storage access for StreamNode to serve files.');
    });
  }, []);

  // Poll status + fetch trusted devices on start
  useEffect(() => {
    if (!nodeStarted) return;
    // fetch trusted devices once on startup
    nodejs.channel.send(JSON.stringify({ type: 'GET_TRUSTED_DEVICES' }));
    const id = setInterval(() => {
      nodejs.channel.send(JSON.stringify({ type: 'GET_STATUS' }));
    }, 10000);
    return () => clearInterval(id);
  }, [nodeStarted]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />

      {tab === TABS.SERVER
        ? <ServerTab
            status={serverStatus}
            ip={serverIP}
            port={serverPort}
            advertising={advertising}
            permissionsOk={permissionsOk}
            errorMsg={errorMsg}
            incomingPairCode={incomingPairCode}
            onClearPairCode={() => setIncomingPairCode(null)}
            trustedDevices={trustedDevices}
            onRevokeDevice={(name) => {
              nodejs.channel.send(JSON.stringify({ type: 'REVOKE_DEVICE', name }));
            }}
          />
        : <BrowseTab />
      }

      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabBtn, tab === TABS.SERVER && styles.tabBtnActive]}
          onPress={() => setTab(TABS.SERVER)}
        >
          <Text style={styles.tabIcon}>📡</Text>
          <Text style={[styles.tabLabel, tab === TABS.SERVER && styles.tabLabelActive]}>
            My Server
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabBtn, tab === TABS.BROWSE && styles.tabBtnActive]}
          onPress={() => setTab(TABS.BROWSE)}
        >
          <Text style={styles.tabIcon}>🌐</Text>
          <Text style={[styles.tabLabel, tab === TABS.BROWSE && styles.tabLabelActive]}>
            Browse
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 1 – Server Status
// ─────────────────────────────────────────────────────────────────────────────

function ServerTab({ status, ip, port, advertising, permissionsOk, errorMsg, incomingPairCode, onClearPairCode, trustedDevices, onRevokeDevice }) {
  const statusColor =
    status === STATUS.RUNNING ? '#22c55e' :
    status === STATUS.ERROR   ? '#ef4444' :
    status === STATUS.STOPPED ? '#f59e0b' : '#94a3b8';

  const toggleAd = () => {
    nodejs.channel.send(JSON.stringify({ type: advertising ? 'ADVERTISE_OFF' : 'ADVERTISE_ON' }));
  };

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} style={styles.flex}>
      <View style={styles.header}>
        <Text style={styles.title}>StreamNode</Text>
        <Text style={styles.subtitle}>Mobile Server</Text>
      </View>

      <Card label="Server Status">
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>
            {status === STATUS.STARTING ? 'Starting…' :
             status === STATUS.RUNNING  ? 'Running' :
             status === STATUS.STOPPED  ? 'Stopped' :
             ('Error: ' + errorMsg)}
          </Text>
          {status === STATUS.STARTING && <ActivityIndicator size="small" color={statusColor} style={{ marginLeft: 8 }} />}
        </View>
      </Card>

      <Card label="Network">
        <InfoRow label="IP Address" value={ip} />
        <InfoRow label="Port"       value={String(port)} />
        <InfoRow label="mDNS"       value={advertising ? 'Advertising' : 'Off'} />
      </Card>

      {status === STATUS.RUNNING && (
        <Card label="Access URLs">
          <Text style={styles.url} selectable>{'http://' + ip + ':' + port + '/files'}</Text>
          <Text style={styles.url} selectable>{'http://' + ip + ':' + port + '/stream/[file]'}</Text>
        </Card>
      )}

      <Card label="Permissions">
        <InfoRow
          label="Storage"
          value={permissionsOk ? '✓ Granted' : '✗ Denied'}
          valueColor={permissionsOk ? '#22c55e' : '#ef4444'}
        />
      </Card>

      {incomingPairCode && (
        <View style={styles.pairNotifCard}>
          <Text style={styles.pairNotifTitle}>📲  Incoming Pair Request</Text>
          <Text style={styles.pairNotifSub}>Show this code to confirm access:</Text>
          <View style={styles.pairCodeRow}>
            {incomingPairCode.split('').map((d, i) => (
              <View key={i} style={styles.pairCodeDigit}>
                <Text style={styles.pairCodeDigitTxt}>{d}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={onClearPairCode} style={styles.pairDismissBtn}>
            <Text style={styles.pairDismissTxt}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Trusted Devices */}
      <Card label={`Trusted Devices (${trustedDevices.length})`}>
        {trustedDevices.length === 0 ? (
          <Text style={{ color: '#64748b', fontSize: 13 }}>No devices have paired yet.</Text>
        ) : (
          trustedDevices.map((d) => (
            <View key={d.deviceName} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#1e293b' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#f1f5f9', fontSize: 13, fontWeight: '600' }}>{d.deviceName}</Text>
                <Text style={{ color: '#64748b', fontSize: 11 }}>Paired {d.pairedAt}</Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  Alert.alert('Revoke Access', `Remove "${d.deviceName}" from trusted devices?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Revoke', style: 'destructive', onPress: () => onRevokeDevice(d.deviceName) },
                  ]);
                }}
                style={{ paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#ef44441a', borderRadius: 8 }}
              >
                <Text style={{ color: '#ef4444', fontSize: 12, fontWeight: '600' }}>Revoke</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </Card>

      <TouchableOpacity
        style={[styles.btn, advertising ? styles.btnOff : styles.btnOn, { marginTop: 8 }]}
        onPress={toggleAd}
        disabled={status !== STATUS.RUNNING}
      >
        <Text style={styles.btnText}>{advertising ? 'Stop mDNS Advertising' : 'Start mDNS Advertising'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tab 2 – Browse Network
// ─────────────────────────────────────────────────────────────────────────────

function BrowseTab() {
  const [scanning, setScanning]             = useState(false);
  const [devices, setDevices]               = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [pathStack, setPathStack]           = useState([]);
  const [loadingFiles, setLoadingFiles]     = useState(false);
  const [fileError, setFileError]           = useState(null);
  const [search, setSearch]                 = useState('');
  const [mediaScreen, setMediaScreen]       = useState(null); // {type,file,url}
  const [pairingDevice, setPairingDevice]   = useState(null); // device awaiting pairing

  // Listen for SCAN_RESULT from Node.js
  useEffect(() => {
    const listener = nodejs.channel.addListener('message', (msg) => {
      try {
        const data = JSON.parse(msg);
        if (data.type === 'SCAN_RESULT') {
          setDevices(data.devices || []);
          setScanning(false);
        }
      } catch (_) {}
    });
    return () => listener.remove();
  }, []);

  // Android back button
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (mediaScreen)   { setMediaScreen(null); return true; }
      if (pairingDevice) { setPairingDevice(null); return true; }
      if (pathStack.length > 1) {
        setPathStack(s => s.slice(0, -1));
        setSearch('');
        return true;
      }
      if (selectedDevice) {
        setSelectedDevice(null);
        setPathStack([]);
        setSearch('');
        return true;
      }
      return false;
    });
    return () => handler.remove();
  }, [pathStack, selectedDevice, mediaScreen, pairingDevice]);

  const scan = useCallback(() => {
    setScanning(true);
    setDevices([]);
    nodejs.channel.send(JSON.stringify({ type: 'SCAN_DEVICES' }));
    setTimeout(() => setScanning(false), 6000);
  }, []);

  const openDevice = useCallback(async (device, token) => {
    setSelectedDevice(device);
    setPathStack([]);
    setFileError(null);
    setSearch('');
    setLoadingFiles(true);
    try {
      const files = await fetchFiles(device.url, null, token);
      setPathStack([{ path: null, files }]);
    } catch (e) {
      if (e.message === 'UNAUTHORIZED') {
        delete tokenStore[device.url];
        setSelectedDevice(null);
        setPairingDevice(device);
      } else {
        setFileError(e.message);
      }
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  const openFolder = useCallback(async (folderPath) => {
    setLoadingFiles(true);
    setFileError(null);
    setSearch('');
    const token = tokenStore[selectedDevice.url];
    try {
      const files = await fetchFiles(selectedDevice.url, folderPath, token);
      setPathStack(s => [...s, { path: folderPath, files }]);
    } catch (e) {
      if (e.message === 'UNAUTHORIZED') {
        delete tokenStore[selectedDevice.url];
        setSelectedDevice(null);
        setPathStack([]);
        setPairingDevice(selectedDevice);
      } else {
        setFileError(e.message);
      }
    } finally {
      setLoadingFiles(false);
    }
  }, [selectedDevice]);

  const goBack = useCallback(() => {
    if (pathStack.length > 1) {
      setPathStack(s => s.slice(0, -1));
      setSearch('');
    } else {
      setSelectedDevice(null);
      setPathStack([]);
      setSearch('');
    }
  }, [pathStack]);

  const openFile = useCallback((file) => {
    const currentFrame = pathStack[pathStack.length - 1];
    const folderPath = currentFrame ? currentFrame.path : null;
    const token = tokenStore[selectedDevice.url];
    const url = buildStreamUrl(selectedDevice, file, folderPath, token);
    if (file.type === 'video') {
      setMediaScreen({ type: 'video', file, url });
    } else if (file.type === 'audio') {
      setMediaScreen({ type: 'audio', file, url });
    } else if (file.type === 'image') {
      setMediaScreen({ type: 'image', file, url });
    } else {
      // CSV, DOC, PDF, TEXT, unknown → external app / browser
      Linking.openURL(url).catch(() =>
        Alert.alert('No app found', 'No app is registered to open this file type.'),
      );
    }
  }, [selectedDevice, pathStack]);

  const handleDeviceTap = useCallback((device) => {
    const token = tokenStore[device.url];
    if (token) {
      openDevice(device, token);
    } else {
      setPairingDevice(device);
    }
  }, [openDevice]);

  if (mediaScreen) {
    if (mediaScreen.type === 'video')
      return <VideoPlayerScreen url={mediaScreen.url} name={mediaScreen.file.name} onClose={() => setMediaScreen(null)} />;
    if (mediaScreen.type === 'audio')
      return <AudioPlayerScreen url={mediaScreen.url} name={mediaScreen.file.name} onClose={() => setMediaScreen(null)} />;
    if (mediaScreen.type === 'image')
      return <ImageViewerScreen url={mediaScreen.url} name={mediaScreen.file.name} onClose={() => setMediaScreen(null)} />;
  }

  // ── Device list ─────────────────────────────────────────────────────────────
  // Show pairing screen if a device was tapped without a token
  if (pairingDevice && !selectedDevice) {
    return (
      <PairingScreen
        device={pairingDevice}
        onCancel={() => setPairingDevice(null)}
        onPaired={(dev, token) => {
          tokenStore[dev.url] = token;
          setPairingDevice(null);
          openDevice(dev, token);
        }}
      />
    );
  }

  if (!selectedDevice) {
    return (
      <View style={styles.flex}>
        <View style={styles.browseHeader}>
          <Text style={styles.browseTitle}>Network Devices</Text>
          <TouchableOpacity style={styles.scanBtn} onPress={scan} disabled={scanning}>
            {scanning
              ? <ActivityIndicator size="small" color="#38bdf8" />
              : <Text style={styles.scanBtnText}>⟳  Scan</Text>}
          </TouchableOpacity>
        </View>

        {!scanning && devices.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🔍</Text>
            <Text style={styles.emptyTitle}>No devices found</Text>
            <Text style={styles.emptyDesc}>
              Make sure the laptop's StreamNode server is running, then tap Scan.
            </Text>
          </View>
        )}

        {scanning && (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color="#38bdf8" />
            <Text style={[styles.emptyDesc, { marginTop: 16 }]}>Scanning LAN for 4 seconds…</Text>
          </View>
        )}

        <FlatList
          data={devices}
          keyExtractor={d => d.url}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.deviceCard} onPress={() => handleDeviceTap(item)}>
              <Text style={styles.deviceIcon}>💻</Text>
              <View style={styles.flex}>
                <Text style={styles.deviceName}>{item.name}</Text>
                <Text style={styles.deviceMeta}>{item.host}:{item.port}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    );
  }

  // ── File browser ─────────────────────────────────────────────────────────────
  const currentFrame = pathStack[pathStack.length - 1];
  const currentFiles = currentFrame ? currentFrame.files : [];
  const currentPath  = currentFrame ? currentFrame.path  : null;

  const filtered = search.trim()
    ? currentFiles.filter(f => f.name.toLowerCase().includes(search.toLowerCase()))
    : currentFiles;

  return (
    <View style={styles.flex}>
      <View style={styles.fileBrowserHeader}>
        <TouchableOpacity onPress={goBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.deviceNameSmall} numberOfLines={1}>{selectedDevice.name}</Text>
          <Text style={styles.pathText} numberOfLines={1}>{currentPath || 'root'}</Text>
        </View>
      </View>

      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search files…"
          placeholderTextColor="#475569"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Text style={styles.clearBtn}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {loadingFiles && (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color="#38bdf8" />
        </View>
      )}

      {fileError && (
        <View style={[styles.emptyState, { paddingHorizontal: 24 }]}>
          <Text style={styles.errorText}>⚠️  {fileError}</Text>
        </View>
      )}

      {!loadingFiles && !fileError && (
        <FlatList
          data={filtered}
          keyExtractor={f => f.path || f.name}
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}
          renderItem={({ item: file }) => (
            <TouchableOpacity
              style={styles.fileRow}
              onPress={() => {
                if (file.isDirectory) {
                  openFolder(file.path || (currentPath ? currentPath + '/' + file.name : file.name));
                } else {
                  openFile(file);
                }
              }}
            >
              <Text style={styles.fileIcon}>{TYPE_ICONS[file.type] || '📦'}</Text>
              <View style={styles.flex}>
                <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
                {file.size > 0 && <Text style={styles.fileMeta}>{formatSize(file.size)}</Text>}
              </View>
              {file.isDirectory && <Text style={styles.chevron}>›</Text>}
              {(file.type === 'video' || file.type === 'audio') && <Text style={styles.playIcon}>▶</Text>}
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyDesc}>{search ? 'No matches' : 'Empty folder'}</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pairing Screen
// ─────────────────────────────────────────────────────────────────────────────

function PairingScreen({ device, onCancel, onPaired }) {
  const [step, setStep]   = useState('idle'); // idle | requesting | show_code | verifying | error
  const [code, setCode]   = useState('');
  const [errMsg, setErrMsg] = useState('');

  const requestCode = async () => {
    setStep('requesting');
    setErrMsg('');
    try {
      const res  = await fetch(device.url + '/pair/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      // Server does NOT return the code — it only shows it on its own screen
      setCode('');
      setStep('show_code');
    } catch (e) {
      setErrMsg(e.message);
      setStep('error');
    }
  };

  const confirmPair = async () => {
    setStep('verifying');
    setErrMsg('');
    try {
      const res  = await fetch(device.url + '/pair/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairingCode: code, deviceName: 'Phone' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      onPaired(device, data.token);
    } catch (e) {
      setErrMsg(e.message);
      setStep('error');
    }
  };

  return (
    <View style={styles.flex}>
      {/* Header */}
      <View style={styles.fileBrowserHeader}>
        <TouchableOpacity onPress={onCancel} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.flex}>
          <Text style={styles.deviceNameSmall}>Pair with {device.name}</Text>
          <Text style={styles.pathText}>{device.host}:{device.port}</Text>
        </View>
      </View>

      <View style={styles.pairBody}>

        {step === 'idle' && (
          <>
            <Text style={styles.pairIcon}>🔐</Text>
            <Text style={styles.pairDesc}>
              This device requires authentication.{'\n'}
              Request a pairing code to gain access.
            </Text>
            <TouchableOpacity style={[styles.btn, styles.btnOn, { width: '100%' }]} onPress={requestCode}>
              <Text style={styles.btnText}>Request Pairing Code</Text>
            </TouchableOpacity>
          </>
        )}

        {(step === 'requesting' || step === 'verifying') && (
          <>
            <ActivityIndicator size="large" color="#38bdf8" />
            <Text style={styles.pairDesc}>
              {step === 'requesting' ? 'Requesting code…' : 'Verifying pairing code…'}
            </Text>
          </>
        )}

        {step === 'show_code' && (
          <>
            <Text style={styles.pairDesc}>
              A 6-digit code was generated on{' '}
              <Text style={{ color: '#38bdf8', fontWeight: '600' }}>{device.name}</Text>.{'\n'}
              Look it up on that device (terminal or screen){'\n'}and enter it below.
            </Text>
            <TextInput
              style={{
                fontSize: 28,
                letterSpacing: 10,
                textAlign: 'center',
                borderWidth: 2,
                borderColor: '#38bdf8',
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: 16,
                width: '80%',
                color: '#f8fafc',
                marginBottom: 20,
              }}
              placeholder="------"
              placeholderTextColor="#475569"
              keyboardType="numeric"
              maxLength={6}
              value={code}
              onChangeText={setCode}
            />
            <TouchableOpacity
              style={[styles.btn, styles.btnOn, { width: '100%', opacity: code.length === 6 ? 1 : 0.4 }]}
              onPress={confirmPair}
              disabled={code.length !== 6}
            >
              <Text style={styles.btnText}>✓  Confirm Pairing</Text>
            </TouchableOpacity>
          </>
        )}

        {step === 'error' && (
          <>
            <Text style={{ fontSize: 44, marginBottom: 16 }}>⚠️</Text>
            <Text style={styles.errorText}>{errMsg}</Text>
            <TouchableOpacity style={[styles.btn, styles.btnOn, { width: '100%', marginTop: 20 }]} onPress={() => setStep('idle')}>
              <Text style={styles.btnText}>Try Again</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Media screens
// ─────────────────────────────────────────────────────────────────────────────

function formatTime(secs) {
  if (!secs || secs < 0) return '0:00';
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function SeekBar({ progress, duration, onSeek, onTouchStart, onTouchEnd }) {
  const barWidthRef = useRef(1);
  const thumbAnim   = useRef(new Animated.Value(0)).current;
  const filled = duration > 0 ? Math.min(1, progress / duration) : 0;

  useEffect(() => {
    Animated.spring(thumbAnim, { toValue: filled, useNativeDriver: false, overshootClamping: true }).start();
  }, [filled]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder:  () => true,
      onPanResponderGrant: (e) => {
        onTouchStart && onTouchStart();
        const f = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidthRef.current));
        onSeek(f);
      },
      onPanResponderMove: (e) => {
        const f = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidthRef.current));
        onSeek(f);
      },
      onPanResponderRelease: () => { onTouchEnd && onTouchEnd(); },
    }),
  ).current;

  const thumbPos = thumbAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View
      style={pStyles.seekOuter}
      onLayout={e => { barWidthRef.current = e.nativeEvent.layout.width || 1; }}
      {...responder.panHandlers}
    >
      <View style={pStyles.seekTrack}>
        <View style={[pStyles.seekFill, { flex: filled || 0.0001 }]} />
        <View style={[pStyles.seekEmpty, { flex: Math.max(0.0001, 1 - filled) }]} />
      </View>
      <Animated.View style={[pStyles.seekThumb, { left: thumbPos }]} />
    </View>
  );
}

function VideoPlayerScreen({ url, name, onClose }) {
  const [paused, setPaused]           = useState(false);
  const [progress, setProgress]       = useState(0);
  const [duration, setDuration]       = useState(0);
  const [showControls, setShowControls] = useState(false); // hidden until loaded
  const [buffering, setBuffering]     = useState(true);
  const [loaded, setLoaded]           = useState(false);
  const [fullscreen, setFullscreen]   = useState(false);
  const [seeking, setSeeking]         = useState(false);
  const controlsAnim                  = useRef(new Animated.Value(0)).current;
  const videoRef                      = useRef(null);
  const hideTimer                     = useRef(null);
  const progressRef                   = useRef(0);
  const durationRef                   = useRef(0);

  // Keep refs in sync so skip() always has fresh values
  useEffect(() => { progressRef.current = progress; }, [progress]);
  useEffect(() => { durationRef.current = duration; }, [duration]);

  const showCtrl = useCallback(() => {
    clearTimeout(hideTimer.current);
    Animated.timing(controlsAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    setShowControls(true);
    hideTimer.current = setTimeout(() => {
      Animated.timing(controlsAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() =>
        setShowControls(false),
      );
    }, 3500);
  }, [controlsAnim]);

  const hideCtrl = useCallback(() => {
    clearTimeout(hideTimer.current);
    Animated.timing(controlsAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() =>
      setShowControls(false),
    );
  }, [controlsAnim]);

  const toggleControls = useCallback(() => {
    if (showControls) hideCtrl(); else showCtrl();
  }, [showControls, showCtrl, hideCtrl]);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  const togglePlay = () => { setPaused(s => !s); showCtrl(); };

  const seekTo = useCallback((fraction) => {
    const d = durationRef.current;
    if (videoRef.current && d > 0) {
      videoRef.current.seek(fraction * d);
      setProgress(fraction * d);
    }
  }, []);

  const skip = (secs) => {
    const clamped = Math.max(0, Math.min(durationRef.current, progressRef.current + secs));
    if (videoRef.current) videoRef.current.seek(clamped);
    setProgress(clamped);
    showCtrl();
  };

  const toggleFullscreen = () => {
    if (fullscreen) {
      videoRef.current && videoRef.current.dismissFullscreenPlayer();
    } else {
      videoRef.current && videoRef.current.presentFullscreenPlayer();
    }
  };

  return (
    <View style={pStyles.videoContainer}>
      <StatusBar hidden />

      {/* Video — sits underneath touch overlay */}
      <Video
        ref={videoRef}
        source={{ uri: url }}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        paused={paused}
        fullscreen={fullscreen}
        onProgress={({ currentTime, seekableDuration }) => {
          if (!seeking) setProgress(currentTime);
          if (seekableDuration > 0) setDuration(seekableDuration);
        }}
        onLoad={({ duration: d }) => {
          setDuration(d);
          setBuffering(false);
          setLoaded(true);
          showCtrl();
        }}
        onBuffer={({ isBuffering }) => setBuffering(isBuffering)}
        onEnd={() => { setPaused(true); showCtrl(); }}
        onFullscreenPlayerDidPresent={() => setFullscreen(true)}
        onFullscreenPlayerDidDismiss={() => setFullscreen(false)}
        progressUpdateInterval={500}
        ignoreSilentSwitch="ignore"
      />

      {/* Transparent touch overlay — catches taps without blocking video */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        onPress={loaded ? toggleControls : undefined}
        activeOpacity={1}
      />

      {/* Buffering spinner */}
      {buffering && (
        <View style={pStyles.bufferOverlay} pointerEvents="none">
          <View style={pStyles.bufferBadge}>
            <ActivityIndicator size="large" color="#38bdf8" />
            <Text style={pStyles.bufferTxt}>Buffering…</Text>
          </View>
        </View>
      )}

      {/* Controls (fade in/out) */}
      {showControls && (
        <Animated.View style={[pStyles.videoControls, { opacity: controlsAnim }]} pointerEvents="box-none">
          {/* Top bar */}
          <View style={pStyles.topBar}>
            <TouchableOpacity onPress={onClose} style={pStyles.iconBtn} hitSlop={{ top:12,bottom:12,left:12,right:12 }}>
              <Text style={pStyles.iconTxt}>✕</Text>
            </TouchableOpacity>
            <Text style={pStyles.videoTitle} numberOfLines={1}>{name}</Text>
            <TouchableOpacity onPress={toggleFullscreen} style={pStyles.iconBtn} hitSlop={{ top:12,bottom:12,left:12,right:12 }}>
              <Text style={pStyles.iconTxt}>{fullscreen ? '⊡' : '⛶'}</Text>
            </TouchableOpacity>
          </View>

          {/* Centre play/pause tap zone */}
          <TouchableOpacity style={pStyles.centerZone} onPress={togglePlay} activeOpacity={0.7}>
            <View style={[pStyles.centerPlayBtn, { opacity: loaded ? 1 : 0.4 }]}>
              <Text style={pStyles.centerPlayTxt}>{paused ? '▶' : '⏸'}</Text>
            </View>
          </TouchableOpacity>

          {/* Bottom bar */}
          <View style={pStyles.bottomBar}>
            <View style={pStyles.timeRowTop}>
              <Text style={pStyles.timeTxt}>{formatTime(progress)}</Text>
              <Text style={pStyles.durationTxt}>{formatTime(duration)}</Text>
            </View>
            <SeekBar
              progress={progress}
              duration={duration}
              onSeek={seekTo}
              onTouchStart={() => { setSeeking(true); clearTimeout(hideTimer.current); }}
              onTouchEnd={() => { setSeeking(false); showCtrl(); }}
            />
            <View style={pStyles.timeRow}>
              <TouchableOpacity onPress={() => skip(-10)} style={pStyles.skipBtn}>
                <Text style={pStyles.skipIcon}>↺</Text>
                <Text style={pStyles.skipLabel}>10s</Text>
              </TouchableOpacity>
              <View style={pStyles.centerBtns}>
                <TouchableOpacity onPress={() => skip(-30)} style={pStyles.ctrlBtn}>
                  <Text style={pStyles.ctrlBtnTxt}>«</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={togglePlay} style={pStyles.playPauseBtn}>
                  <Text style={pStyles.playPauseTxt}>{paused ? '▶' : '⏸'}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => skip(30)} style={pStyles.ctrlBtn}>
                  <Text style={pStyles.ctrlBtnTxt}>»</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => skip(10)} style={pStyles.skipBtn}>
                <Text style={pStyles.skipIcon}>↻</Text>
                <Text style={pStyles.skipLabel}>10s</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

function AudioPlayerScreen({ url, name, onClose }) {
  const [paused, setPaused]     = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const videoRef   = useRef(null);
  const durationRef = useRef(0);
  const progressRef = useRef(0);
  useEffect(() => { durationRef.current = duration; }, [duration]);
  useEffect(() => { progressRef.current = progress; }, [progress]);

  const skip = (secs) => {
    const clamped = Math.max(0, Math.min(durationRef.current, progressRef.current + secs));
    if (videoRef.current) videoRef.current.seek(clamped);
    setProgress(clamped);
  };

  const pct = duration > 0 ? progress / duration : 0;

  return (
    <View style={pStyles.audioContainer}>
      <Video
        ref={videoRef}
        source={{ uri: url }}
        style={{ width: 0, height: 0 }}
        audioOnly={true}
        paused={paused}
        onProgress={({ currentTime }) => setProgress(currentTime)}
        onLoad={({ duration: d }) => { setDuration(d); setBuffering(false); }}
        onBuffer={({ isBuffering }) => setBuffering(isBuffering)}
        onEnd={() => setPaused(true)}
        progressUpdateInterval={500}
        ignoreSilentSwitch="ignore"
      />

      <TouchableOpacity onPress={onClose} style={pStyles.audioCloseBtn} hitSlop={{ top:10, bottom:10, left:10, right:10 }}>
        <Text style={pStyles.closeTxt}>✕</Text>
      </TouchableOpacity>

      {/* Album art disc */}
      <View style={[pStyles.discOuter, paused ? null : pStyles.discSpin]}>
        <View style={pStyles.discInner}>
          {buffering
            ? <ActivityIndicator size="large" color="#38bdf8" />
            : <Text style={{ fontSize: 64 }}>🎵</Text>}
        </View>
      </View>

      {/* Track name */}
      <Text style={pStyles.trackName} numberOfLines={2}>{name}</Text>

      {/* Time labels */}
      <View style={pStyles.audioTimeRow}>
        <Text style={pStyles.timeTxt}>{formatTime(progress)}</Text>
        <Text style={pStyles.timeTxt}>{formatTime(duration)}</Text>
      </View>

      {/* Seek bar */}
      <View style={pStyles.audioSeekWrap}>
        <SeekBar
          progress={progress}
          duration={duration}
          onSeek={(f) => {
            const t = f * durationRef.current;
            if (videoRef.current) videoRef.current.seek(t);
            setProgress(t);
          }}
        />
      </View>

      {/* Controls */}
      <View style={pStyles.audioBtns}>
        <TouchableOpacity onPress={() => skip(-30)} style={pStyles.ctrlBtn}>
          <Text style={pStyles.ctrlBtnTxt}>«</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => skip(-10)} style={pStyles.skipBtn}>
          <Text style={pStyles.skipIcon}>↺</Text>
          <Text style={pStyles.skipLabel}>10</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setPaused(s => !s)} style={pStyles.audioPlayBtn}>
          <Text style={pStyles.audioPlayTxt}>{paused ? '▶' : '⏸'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => skip(10)} style={pStyles.skipBtn}>
          <Text style={pStyles.skipIcon}>↻</Text>
          <Text style={pStyles.skipLabel}>10</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => skip(30)} style={pStyles.ctrlBtn}>
          <Text style={pStyles.ctrlBtnTxt}>»</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ImageViewerScreen({ url, name, onClose }) {
  const { width, height } = Dimensions.get('window');
  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden />
      <TouchableOpacity onPress={onClose} style={pStyles.imgCloseBtn} hitSlop={{ top:10,bottom:10,left:10,right:10 }}>
        <Text style={pStyles.closeTxt}>✕</Text>
      </TouchableOpacity>
      <Text style={pStyles.imgTitle} numberOfLines={1}>{name}</Text>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
        maximumZoomScale={5}
        minimumZoomScale={1}
        centerContent={true}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={{ uri: url }}
          style={{ width, height: height - 56 }}
          resizeMode="contain"
        />
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable primitives
// ─────────────────────────────────────────────────────────────────────────────

function Card({ label, children }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value, valueColor }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const C = {
  bg:     '#0f172a',
  card:   '#1e293b',
  border: '#334155',
  text:   '#f1f5f9',
  muted:  '#94a3b8',
  brand:  '#38bdf8',
};

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: C.bg },
  flex:  { flex: 1 },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  tabBtnActive: {
    borderTopWidth: 2,
    borderTopColor: C.brand,
  },
  tabIcon:        { fontSize: 20 },
  tabLabel:       { fontSize: 11, color: C.muted, marginTop: 2 },
  tabLabelActive: { color: C.brand, fontWeight: '700' },

  // Server tab
  scrollContent: { padding: 20, paddingBottom: 32 },
  header:        { alignItems: 'center', marginBottom: 24 },
  title:         { fontSize: 28, fontWeight: '800', color: C.text },
  subtitle:      { fontSize: 13, color: C.muted, marginTop: 2 },

  card:      { backgroundColor: C.card, borderRadius: 12, padding: 16, marginBottom: 14 },
  cardLabel: {
    fontSize: 10, fontWeight: '700', color: '#64748b',
    textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10,
  },

  statusRow: { flexDirection: 'row', alignItems: 'center' },
  dot:       { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusText:{ fontSize: 17, fontWeight: '600' },

  infoRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  infoLabel: { color: C.muted, fontSize: 14 },
  infoValue: { color: C.text, fontSize: 14, fontWeight: '600' },

  url:    { color: C.brand, fontFamily: 'monospace', fontSize: 12, paddingVertical: 3 },
  btn:    { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  btnOn:  { backgroundColor: '#0ea5e9' },
  btnOff: { backgroundColor: '#475569' },
  btnText:{ color: '#fff', fontWeight: '700', fontSize: 15 },

  // Browse tab
  browseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  browseTitle: { fontSize: 18, fontWeight: '700', color: C.text },
  scanBtn:     { paddingHorizontal: 14, paddingVertical: 7, backgroundColor: '#0c4a6e', borderRadius: 8 },
  scanBtnText: { color: C.brand, fontWeight: '700', fontSize: 14 },

  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  deviceIcon: { fontSize: 28, marginRight: 12 },
  deviceName: { color: C.text, fontWeight: '600', fontSize: 15 },
  deviceMeta: { color: C.muted, fontSize: 12, marginTop: 2 },
  chevron:    { color: C.muted, fontSize: 22, marginLeft: 8 },

  // File browser
  fileBrowserHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.card,
  },
  backBtn:        { paddingHorizontal: 10, paddingVertical: 4 },
  backBtnText:    { color: C.brand, fontSize: 26, lineHeight: 30 },
  deviceNameSmall:{ color: C.text, fontWeight: '600', fontSize: 14 },
  pathText:       { color: C.muted, fontSize: 11, marginTop: 1 },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 10,
    paddingHorizontal: 12,
    backgroundColor: C.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  searchIcon:  { fontSize: 14, marginRight: 6 },
  searchInput: { flex: 1, height: 38, color: C.text, fontSize: 14 },
  clearBtn:    { color: C.muted, fontSize: 16, paddingHorizontal: 4 },

  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  fileIcon:  { fontSize: 22, marginRight: 12 },
  fileName:  { color: C.text, fontSize: 14, fontWeight: '500' },
  fileMeta:  { color: C.muted, fontSize: 11, marginTop: 2 },
  playIcon:  { color: C.brand, fontSize: 16, marginLeft: 8 },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon:  { fontSize: 48, marginBottom: 12 },
  emptyTitle: { color: C.text, fontSize: 17, fontWeight: '600', marginBottom: 8 },
  emptyDesc:  { color: C.muted, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  errorText:  { color: '#ef4444', fontSize: 14, textAlign: 'center' },

  // ── Pairing screen ──────────────────────────────────────────────────────────
  pairBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 18,
  },
  pairIcon: { fontSize: 56 },
  pairDesc: {
    color: C.muted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
  },
  pairCodeRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 8,
  },
  pairCodeDigit: {
    width: 42, height: 56,
    borderRadius: 10,
    backgroundColor: C.card,
    borderWidth: 2, borderColor: C.brand,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: C.brand, shadowOpacity: 0.3,
    shadowRadius: 6, elevation: 4,
  },
  pairCodeDigitTxt: {
    color: C.brand,
    fontSize: 26,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  pairNote: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 4,
  },

  // ── Incoming pair notification (ServerTab) ──────────────────────────────────
  pairNotifCard: {
    backgroundColor: '#0c2340',
    borderRadius: 12,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#0369a1',
    alignItems: 'center',
  },
  pairNotifTitle: {
    color: '#38bdf8',
    fontWeight: '700',
    fontSize: 15,
    marginBottom: 4,
  },
  pairNotifSub: { color: C.muted, fontSize: 13, marginBottom: 12 },
  pairDismissBtn: {
    marginTop: 12,
    paddingVertical: 8, paddingHorizontal: 24,
    backgroundColor: '#1e3a5f',
    borderRadius: 8,
  },
  pairDismissTxt: { color: '#94a3b8', fontSize: 13 },
});

// ── Player / viewer styles ────────────────────────────────────────────────────
const pStyles = StyleSheet.create({

  // ── Video player ──────────────────────────────────────────────────────────
  videoContainer: { flex: 1, backgroundColor: '#000' },

  videoControls: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 14,
    paddingBottom: 12,
    paddingHorizontal: 16,
    background: 'transparent',
    // dark gradient from top
    backgroundColor: 'rgba(0,0,0,0.65)',
  },

  iconBtn:  { padding: 6 },
  iconTxt:  { color: '#fff', fontSize: 19, fontWeight: '700' },
  closeTxt: { color: '#fff', fontSize: 20, fontWeight: '700' },
  videoTitle: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
    marginHorizontal: 10,
  },

  // Centre tap zone for play/pause
  centerZone: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerPlayBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: 'rgba(14,165,233,0.85)',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.4,
    shadowRadius: 12, elevation: 8,
  },
  centerPlayTxt: { color: '#fff', fontSize: 28, marginLeft: 3 },

  bottomBar: {
    paddingBottom: 20,
    paddingTop: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },

  timeRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  timeTxt:    { color: '#94a3b8', fontSize: 12 },
  durationTxt:{ color: '#64748b', fontSize: 12 },

  // Seek bar
  seekOuter: {
    height: 36,
    justifyContent: 'center',
    marginBottom: 8,
  },
  seekTrack: {
    flexDirection: 'row',
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  seekFill:  { height: 4, backgroundColor: '#38bdf8' },
  seekEmpty: { height: 4, backgroundColor: '#334155' },
  seekThumb: {
    position: 'absolute',
    top: 10,
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#38bdf8',
    marginLeft: -8,
    shadowColor: '#38bdf8', shadowOpacity: 0.6,
    shadowRadius: 4, elevation: 4,
  },

  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },

  centerBtns: { flexDirection: 'row', alignItems: 'center', gap: 14 },

  skipBtn: { alignItems: 'center', paddingHorizontal: 8 },
  skipIcon: { color: '#cbd5e1', fontSize: 22 },
  skipLabel:{ color: '#64748b', fontSize: 10, marginTop: -2 },

  ctrlBtn:    { padding: 8 },
  ctrlBtnTxt: { color: '#94a3b8', fontSize: 22, fontWeight: '700' },

  playPauseBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: '#0ea5e9',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#0ea5e9', shadowOpacity: 0.5,
    shadowRadius: 8, elevation: 6,
  },
  playPauseTxt: { color: '#fff', fontSize: 20, marginLeft: 2 },

  bufferOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center',
  },
  bufferBadge: {
    backgroundColor: 'rgba(15,23,42,0.75)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  bufferTxt: { color: '#94a3b8', fontSize: 13, marginTop: 8 },

  // ── Audio player ──────────────────────────────────────────────────────────
  audioContainer: {
    flex: 1,
    backgroundColor: '#0a0f1e',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  audioCloseBtn: { position: 'absolute', top: 20, left: 20, padding: 8, zIndex: 10 },

  // Vinyl disc
  discOuter: {
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: '#1e293b',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 32,
    borderWidth: 6, borderColor: '#334155',
    shadowColor: '#38bdf8', shadowOpacity: 0.25,
    shadowRadius: 20, elevation: 10,
  },
  discSpin: {
    // React Native doesn't have CSS animations natively;
    // visual pulse provided via borderColor contrast
    borderColor: '#0ea5e9',
  },
  discInner: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#0f172a',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#334155',
  },

  trackName: {
    color: '#f1f5f9', fontSize: 17, fontWeight: '700',
    textAlign: 'center', lineHeight: 24,
    marginBottom: 16,
  },

  audioTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 6,
  },

  audioSeekWrap: { width: '100%', marginBottom: 28 },

  audioBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 4,
  },
  audioPlayBtn: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: '#0ea5e9',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#0ea5e9', shadowOpacity: 0.5,
    shadowRadius: 12, elevation: 8,
  },
  audioPlayTxt: { color: '#fff', fontSize: 26, marginLeft: 3 },

  // ── Image viewer ──────────────────────────────────────────────────────────
  imgCloseBtn: {
    position: 'absolute', top: 16, left: 16, zIndex: 10,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(15,23,42,0.7)',
    justifyContent: 'center', alignItems: 'center',
  },
  imgTitle: {
    position: 'absolute', top: 22, left: 66, right: 12, zIndex: 10,
    color: '#e2e8f0', fontSize: 13, fontWeight: '600',
  },
});
