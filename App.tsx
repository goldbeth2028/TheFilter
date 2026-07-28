import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TabBar, type TabKey } from './src/components/TabBar';
import { ActivityScreen } from './src/screens/ActivityScreen';
import { BrowseScreen } from './src/screens/BrowseScreen';
import { FiltersScreen } from './src/screens/FiltersScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { InspectScreen } from './src/screens/InspectScreen';
import { useFeed } from './src/store/feed';
import { colors } from './src/theme';

/**
 * The design doc's three tabs, plus Browse. Tab switching is plain state rather
 * than a navigation library — the design specifies a custom tab bar and there is
 * no stack to push, so a router would be weight without a job.
 */
export default function App() {
  const [tab, setTab] = useState<TabKey>('home');
  const [inspecting, setInspecting] = useState(false);
  const [visitedBrowse, setVisitedBrowse] = useState(false);
  const refresh = useFeed((s) => s.refresh);

  const changeTab = (next: TabKey) => {
    if (next === 'browse') setVisitedBrowse(true);
    setTab(next);
  };

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <StatusBar style="light" />

        {/*
          All three screens stay mounted. Keeping the feed alive preserves scroll
          position and, more importantly, the set of posts the user already chose
          to reveal — re-mounting would silently re-hide them.
        */}
        <View style={[styles.screen, tab !== 'home' && styles.hidden]} pointerEvents={tab === 'home' ? 'auto' : 'none'}>
          <HomeScreen onManageSources={() => setTab('filters')} />
        </View>
        <View
          style={[styles.screen, tab !== 'filters' && styles.hidden]}
          pointerEvents={tab === 'filters' ? 'auto' : 'none'}
        >
          <FiltersScreen />
        </View>
        <View
          style={[styles.screen, tab !== 'activity' && styles.hidden]}
          pointerEvents={tab === 'activity' ? 'auto' : 'none'}
        >
          <ActivityScreen onInspect={() => setInspecting(true)} />
        </View>
        {/*
          The browser mounts only once visited. A WebView is expensive and would
          otherwise start loading a page the user never asked for.
        */}
        {visitedBrowse ? (
          <View
            style={[styles.screen, tab !== 'browse' && styles.hidden]}
            pointerEvents={tab === 'browse' ? 'auto' : 'none'}
          >
            <BrowseScreen />
          </View>
        ) : null}

        <TabBar active={tab} onChange={changeTab} />
        <InspectScreen visible={inspecting} onClose={() => setInspecting(false)} />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  screen: { ...StyleSheet.absoluteFillObject },
  hidden: { opacity: 0, zIndex: -1 },
});
