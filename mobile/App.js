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
} from 'react-native';
import nodejs from 'nodejs-mobile-react-native';

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

function buildStreamUrl(device, file, folderPath) {
  const dir = folderPath != null ? encodeURIComponent(folderPath) : '';
  const name = encodeURIComponent(file.name);
  return device.url + '/stream/' + name + (dir ? '?path=' + dir : '');
}

async function fetchFiles(deviceUrl, path) {
  const url = path != null
    ? deviceUrl + '/files?path=' + encodeURIComponent(path)
    : deviceUrl + '/files';
  const res = await fetch(url);
  if (!res.ok) throw new Error('HTTP ' + res.status);
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

  // Poll status
  useEffect(() => {
    if (!nodeStarted) return;
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

function ServerTab({ status, ip, port, advertising, permissionsOk, errorMsg }) {
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
  }, [pathStack, selectedDevice]);

  const scan = useCallback(() => {
    setScanning(true);
    setDevices([]);
    nodejs.channel.send(JSON.stringify({ type: 'SCAN_DEVICES' }));
    setTimeout(() => setScanning(false), 6000);
  }, []);

  const openDevice = useCallback(async (device) => {
    setSelectedDevice(device);
    setPathStack([]);
    setFileError(null);
    setSearch('');
    setLoadingFiles(true);
    try {
      const files = await fetchFiles(device.url, null);
      setPathStack([{ path: null, files }]);
    } catch (e) {
      setFileError(e.message);
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  const openFolder = useCallback(async (folderPath) => {
    setLoadingFiles(true);
    setFileError(null);
    setSearch('');
    try {
      const files = await fetchFiles(selectedDevice.url, folderPath);
      setPathStack(s => [...s, { path: folderPath, files }]);
    } catch (e) {
      setFileError(e.message);
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

  const playFile = useCallback((file) => {
    const currentFrame = pathStack[pathStack.length - 1];
    const folderPath = currentFrame ? currentFrame.path : null;
    const streamUrl = buildStreamUrl(selectedDevice, file, folderPath);

    Alert.alert(
      'Play: ' + file.name,
      'Open in external player?\n\n' + streamUrl,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: '▶ Open Player',
          onPress: () => Linking.openURL(streamUrl).catch(() =>
            Alert.alert('Error', 'No app found to play this file. Install VLC.'),
          ),
        },
        {
          text: '🌐 Browser',
          onPress: () => Linking.openURL(streamUrl),
        },
      ],
    );
  }, [selectedDevice, pathStack]);

  // ── Device list ─────────────────────────────────────────────────────────────
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
            <TouchableOpacity style={styles.deviceCard} onPress={() => openDevice(item)}>
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
                } else if (file.type === 'video' || file.type === 'audio' || file.type === 'image') {
                  playFile(file);
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
});
