import * as FileSystem from 'expo-file-system';
import { FontAwesome } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useCallback, useEffect, useState } from 'react';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import {
  clearLocalAudioFiles,
  deleteAllRecordings,
  deleteRecording,
  fetchRecordingHistory,
  processAudioForTranscription,
} from '../utils/audioProcessor';
import { auth } from '../firebaseInit'; // Import auth from firebaseInit
import { signOut } from 'firebase/auth';
import { Recording } from '../utils/types';

// Navigation types
type TabParamList = {
  Home: undefined;
  Recording: undefined;
  History: undefined;
};

type RootStackParamList = {
  Report: {
    recordingId: string;
    audioUri: string | null;
    transcription?: string;
    recommendations?: string;
    file: {
      storageUrl?: string;
      filename: string;
      path: string;
    };
    skipCopyingAudio?: boolean;
  };
};

type HistoryScreenNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<TabParamList, 'History'>,
  NativeStackNavigationProp<RootStackParamList>
>;

interface HistoryScreenProps {
  navigation: HistoryScreenNavigationProp;
}

// Extend global interface for recordingsCache
declare global {
  var recordingsCache: Recording[] | null;
}

const HistoryScreen: React.FC<HistoryScreenProps> = ({ navigation }) => {
  const [user, setUser] = useState(auth.currentUser);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Monitor auth state
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        loadRecordings();
      } else {
        setRecordings([]);
        setLoading(false);
        navigation.navigate('SignIn'); // Redirect to SignIn if not authenticated
      }
    });
    return () => unsubscribe();
  }, [navigation]);

  // Load recordings when screen is focused
  useFocusEffect(
    useCallback(() => {
      if (user) {
        loadRecordings();
      }
      return () => {};
    }, [user])
  );

  const loadRecordings = async () => {
    try {
      setLoading(true);
      setError(null);
      const timestamp = new Date().getTime();
      global.recordingsCache = null;
      await new Promise((resolve) => setTimeout(resolve, 300));
      const recordingsData = await fetchRecordingHistory(`nocache=${timestamp}`);
      setRecordings(recordingsData);
    } catch (err: any) {
      console.error('Error loading recordings:', err);
      setError(err.message || 'Failed to load recordings');
      setRecordings([]);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    try {
      const audioPath = `${FileSystem.documentDirectory}audio/test.mp3`;
      const fileInfo = await FileSystem.getInfoAsync(audioPath);
      if (!fileInfo.exists) {
        throw new Error(`Audio file does not exist at: ${audioPath}`);
      }
      const result = await processAudioForTranscription(audioPath);
      Alert.alert('Success', 'Audio uploaded successfully');
      loadRecordings();
    } catch (err: any) {
      Alert.alert('Error', `Upload failed: ${err.message}`);
    }
  };

  const handleClearLocalFiles = async () => {
    try {
      await clearLocalAudioFiles();
      Alert.alert('Success', 'Cleared local audio files');
    } catch (err: any) {
      Alert.alert('Error', `Failed to clear local files: ${err.message}`);
    }
  };

  const handleDeleteRecording = async (recordingId: string) => {
    try {
      await deleteRecording(recordingId);
      setRecordings((prev) => prev.filter((r) => r.id !== recordingId));
      Alert.alert('Success', `Recording ${recordingId} deleted`);
    } catch (err: any) {
      Alert.alert('Error', `Failed to delete recording: ${err.message}`);
    }
  };

  const handleDeleteAllRecordings = () => {
    Alert.alert(
      'Delete All Recordings',
      'Are you sure you want to delete all recordings? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsDeleting(true);
              setRecordings([]);
              global.recordingsCache = null;
              await deleteAllRecordings();
              await clearLocalAudioFiles();
              Alert.alert('Success', 'All recordings deleted');
              loadRecordings();
            } catch (err: any) {
              Alert.alert('Error', `Failed to delete all recordings: ${err.message}`);
              loadRecordings();
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      Alert.alert('Success', 'Signed out successfully');
      navigation.navigate('SignIn');
    } catch (err: any) {
      Alert.alert('Error', `Failed to sign out: ${err.message}`);
    }
  };

  const formatDate = (createdAt: Recording['createdAt']) => {
    if (!createdAt) return 'Unknown date';
    if (typeof createdAt === 'string') {
      return new Date(createdAt).toLocaleString();
    }
    const date = new Date(createdAt.seconds * 1000);
    return date.toLocaleString();
  };

  const renderItem = ({ item }: { item: Recording }) => (
    <TouchableOpacity
      style={styles.recordingItem}
      onPress={() =>
        navigation.navigate('Report', {
          recordingId: item.id,
          audioUri: null,
          transcription: item.transcript,
          recommendations: item.recommendations,
          file: {
            storageUrl: item.storageUrl,
            filename: item.filename,
            path: item.filePath,
          },
          skipCopyingAudio: true,
        })
      }
    >
      <View style={styles.recordingInfo}>
        <Text style={styles.recordingTitle} numberOfLines={1}>
          {item.filename.split('-').pop()?.split('.')[0] || 'Recording'}
        </Text>
        <Text style={styles.recordingDate}>{formatDate(item.createdAt)}</Text>
        {item.transcript && (
          <Text style={styles.transcriptPreview} numberOfLines={2}>
            {item.transcript.substring(0, 100)}
            {item.transcript.length > 100 ? '...' : ''}
          </Text>
        )}
        <Button
          title="Delete"
          color="#FF3B30"
          onPress={() => handleDeleteRecording(item.id)}
        />
      </View>
      <FontAwesome name="chevron-right" size={16} color="#C7C7CC" />
    </TouchableOpacity>
  );

  const renderEmptyList = () => (
    <View style={styles.emptyContainer}>
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" />
      ) : error ? (
        <>
          <FontAwesome name="exclamation-circle" size={50} color="#FF3B30" />
          <Text style={styles.emptyText}>Error loading recordings</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadRecordings}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <FontAwesome name="microphone" size={50} color="#8E8E93" />
          <Text style={styles.emptyText}>No recordings yet</Text>
          <Text style={styles.emptySubtext}>Your recordings will appear here</Text>
          <TouchableOpacity
            style={styles.recordButton}
            onPress={() => navigation.navigate('Recording')}
          >
            <Text style={styles.recordButtonText}>Start Recording</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        {user ? (
          <View>
            <View style={styles.headerContainer}>
              <Text style={styles.headerTitle}>Consultation History</Text>
              <Text style={styles.userEmail}>Signed in as: {user.email}</Text>
            </View>
            <View style={styles.buttonContainer}>
              <Button title="Upload Audio" onPress={handleUpload} />
              <Button title="Clear Local Files" onPress={handleClearLocalFiles} />
              <Button title="Fetch History" onPress={loadRecordings} />
              {recordings.length > 0 && (
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={handleDeleteAllRecordings}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color="#FF3B30" />
                  ) : (
                    <Text style={styles.clearButtonText}>Delete All</Text>
                  )}
                </TouchableOpacity>
              )}
              <Button title="Sign Out" onPress={handleSignOut} />
            </View>
            {recordings.length > 0 ? (
              <FlatList
                data={recordings}
                renderItem={renderItem}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContainer}
              />
            ) : (
              renderEmptyList()
            )}
            <TouchableOpacity
              style={styles.newConsultationButton}
              onPress={() => navigation.navigate('Recording')}
            >
              <FontAwesome name="plus" size={16} color="#fff" style={styles.buttonIcon} />
              <Text style={styles.newConsultationButtonText}>New Consultation</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.authContainer}>
            <Button
              title="Sign In"
              onPress={() => navigation.navigate('SignIn')}
            />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  contentContainer: {
    padding: 16,
  },
  headerContainer: {
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  userEmail: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 8,
  },
  buttonContainer: {
    marginBottom: 20,
  },
  authContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  recordingInfo: {
    flex: 1,
  },
  recordingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  recordingDate: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 8,
  },
  transcriptPreview: {
    fontSize: 14,
    color: '#3A3A3C',
    lineHeight: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1C1C1E',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 24,
  },
  recordButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 16,
  },
  recordButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#FF3B30',
    marginVertical: 8,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: '#007AFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 16,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  newConsultationButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
    marginTop: 20,
  },
  buttonIcon: {
    marginRight: 10,
  },
  newConsultationButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  clearButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  clearButtonText: {
    fontSize: 14,
    color: '#FF3B30',
    fontWeight: '500',
  },
  listContainer: {
    paddingBottom: 80,
  },
});

export default HistoryScreen;