/**
 * StreamNode Mobile — React Native UI
 *
 * Shows server status, IP address, port, and advertising state.
 * Communicates with the Node.js layer via nodejs-mobile-react-native bridge.
 * Requests required Android storage permissions on launch.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Alert,
} from 'react-native';
import nodejs from 'nodejs-mobile-react-native';

// ── Types ────────────────────────────────────────────────────────────────────

const STATUS = {
  STARTING: 'starting',
  RUNNING:  'running',
  STOPPED:  'stopped',
  ERROR:    'error',
};

// ── Permission helpers ────────────────────────────────────────────────────────

async function requestStoragePermissions() {
  if (Platform.OS !== 'android') return true;

  const androidVersion = Platform.Version;

  // Android 13+: READ_MEDIA_* permissions
  if (androidVersion >= 33) {
    const grants = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
      PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
      PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO,
    ]);
    return Object.values(grants).every(
      (v) => v === PermissionsAndroid.RESULTS.GRANTED,
    );
  }

  // Android 10–12: READ_EXTERNAL_STORAGE
  const read = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
    {
      title: 'Storage Permission',
      message: 'StreamNode needs access to your files to serve them over the network.',
      buttonNeutral: 'Ask Me Later',
      buttonNegative: 'Cancel',
      buttonPositive: 'OK',
    },
  );

  return read === PermissionsAndroid.RESULTS.GRANTED;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function App() {
  const [serverStatus, setServerStatus]   = useState(STATUS.STARTING);
  const [serverIP, setServerIP]           = useState('—');
  const [serverPort, setServerPort]       = useState(9000);
  const [advertising, setAdvertising]     = useState(false);
  const [errorMsg, setErrorMsg]           = useState('');
  const [permissionsOk, setPermissionsOk] = useState(false);
  const [nodeStarted, setNodeStarted]     = useState(false);

  // Start the Node.js server once
  useEffect(() => {
    nodejs.start('main.js');
    setNodeStarted(true);
  }, []);

  // Listen to bridge messages from Node.js
  useEffect(() => {
    const listener = nodejs.channel.addListener('message', (msg) => {
      try {
        const data = JSON.parse(msg);

        switch (data.type) {
          case 'SERVER_STARTED':
            setServerIP(data.ip || '—');
            setServerPort(data.port || 9000);
            setServerStatus(STATUS.RUNNING);
            setAdvertising(true);
            break;

          case 'SERVER_ERROR':
            setServerStatus(STATUS.ERROR);
            setErrorMsg(data.message || 'Unknown error');
            break;

          case 'STATUS':
            setServerIP(data.ip || '—');
            setServerPort(data.port || 9000);
            setAdvertising(data.advertising || false);
            break;

          case 'ADVERTISE_ON_ACK':
            setAdvertising(true);
            break;

          case 'ADVERTISE_OFF_ACK':
            setAdvertising(false);
            break;

          case 'SERVER_STOPPED':
            setServerStatus(STATUS.STOPPED);
            setAdvertising(false);
            break;

          default:
            break;
        }
      } catch {
        // non-JSON messages (e.g. plain strings during init)
        console.log('[bridge]', msg);
      }
    });

    return () => listener.remove();
  }, []);

  // Request permissions on mount
  useEffect(() => {
    requestStoragePermissions().then((granted) => {
      setPermissionsOk(granted);
      if (!granted) {
        Alert.alert(
          'Permission Required',
          'StorageNode needs storage access to serve files. Please grant permission in Settings.',
        );
      }
    });
  }, []);

  // Poll status every 10 s
  useEffect(() => {
    if (!nodeStarted) return;
    const tid = setInterval(() => {
      nodejs.channel.send(JSON.stringify({ type: 'GET_STATUS' }));
    }, 10_000);
    return () => clearInterval(tid);
  }, [nodeStarted]);

  const toggleAdvertising = useCallback(() => {
    const cmd = advertising ? 'ADVERTISE_OFF' : 'ADVERTISE_ON';
    nodejs.channel.send(JSON.stringify({ type: cmd }));
  }, [advertising]);

  // ── UI ──────────────────────────────────────────────────────────────────────

  const statusColor =
    serverStatus === STATUS.RUNNING  ? '#22c55e' :
    serverStatus === STATUS.ERROR    ? '#ef4444' :
    serverStatus === STATUS.STOPPED  ? '#f59e0b' :
    '#94a3b8';

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <ScrollView contentContainerStyle={styles.container}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>StreamNode</Text>
          <Text style={styles.subtitle}>Mobile Server</Text>
        </View>

        {/* Status card */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Server Status</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>
              {serverStatus === STATUS.STARTING && 'Starting…'}
              {serverStatus === STATUS.RUNNING  && 'Running'}
              {serverStatus === STATUS.STOPPED  && 'Stopped'}
              {serverStatus === STATUS.ERROR    && `Error: ${errorMsg}`}
            </Text>
            {serverStatus === STATUS.STARTING && (
              <ActivityIndicator size="small" color={statusColor} style={{ marginLeft: 8 }} />
            )}
          </View>
        </View>

        {/* Network info */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Network</Text>
          <InfoRow label="IP Address" value={serverIP} />
          <InfoRow label="Port"       value={String(serverPort)} />
          <InfoRow label="mDNS"       value={advertising ? 'Advertising' : 'Off'} />
        </View>

        {/* Endpoints */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>API Endpoints</Text>
          <EndpointRow method="GET" path="/device"          desc="Device info" />
          <EndpointRow method="GET" path="/files?path=…"    desc="Directory listing" />
          <EndpointRow method="GET" path="/stream/:file"    desc="Range-request video stream" />
          <EndpointRow method="GET" path="/search?q=…"      desc="File search" />
          <EndpointRow method="GET" path="/file/info?id=…"  desc="File metadata" />
        </View>

        {/* Example URLs */}
        {serverStatus === STATUS.RUNNING && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>Quick Access URLs</Text>
            <Text style={styles.url} selectable>
              http://{serverIP}:{serverPort}/files
            </Text>
            <Text style={styles.url} selectable>
              http://{serverIP}:{serverPort}/device
            </Text>
            <Text style={styles.url} selectable>
              http://{serverIP}:{serverPort}/search?q=mp4
            </Text>
          </View>
        )}

        {/* Permissions */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Permissions</Text>
          <InfoRow
            label="Storage"
            value={permissionsOk ? '✓ Granted' : '✗ Denied'}
            valueColor={permissionsOk ? '#22c55e' : '#ef4444'}
          />
        </View>

        {/* Controls */}
        <View style={styles.controls}>
          <TouchableOpacity
            style={[styles.btn, advertising ? styles.btnOff : styles.btnOn]}
            onPress={toggleAdvertising}
            disabled={serverStatus !== STATUS.RUNNING}
          >
            <Text style={styles.btnText}>
              {advertising ? 'Stop mDNS' : 'Start mDNS'}
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoRow({ label, value, valueColor }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
    </View>
  );
}

function EndpointRow({ method, path: ep, desc }) {
  return (
    <View style={styles.endpointRow}>
      <Text style={styles.endpointMethod}>{method}</Text>
      <View style={styles.endpointMeta}>
        <Text style={styles.endpointPath}>{ep}</Text>
        <Text style={styles.endpointDesc}>{desc}</Text>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f172a' },
  container: { padding: 20, paddingBottom: 40 },

  header: { alignItems: 'center', marginBottom: 24 },
  title: { fontSize: 32, fontWeight: '800', color: '#f8fafc', letterSpacing: 1 },
  subtitle: { fontSize: 14, color: '#94a3b8', marginTop: 2 },

  card: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardLabel: { fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 1 },

  statusRow: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  statusText: { fontSize: 18, fontWeight: '600' },

  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5 },
  infoLabel: { color: '#94a3b8', fontSize: 14 },
  infoValue: { color: '#f1f5f9', fontSize: 14, fontWeight: '600' },

  endpointRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 5 },
  endpointMethod: { color: '#38bdf8', fontFamily: 'monospace', fontSize: 11, fontWeight: '700', width: 34, paddingTop: 2 },
  endpointMeta: { flex: 1 },
  endpointPath: { color: '#e2e8f0', fontFamily: 'monospace', fontSize: 13 },
  endpointDesc: { color: '#64748b', fontSize: 12 },

  url: { color: '#38bdf8', fontFamily: 'monospace', fontSize: 12, paddingVertical: 3 },

  controls: { marginTop: 8, gap: 12 },
  btn: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  btnOn:  { backgroundColor: '#0ea5e9' },
  btnOff: { backgroundColor: '#475569' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
