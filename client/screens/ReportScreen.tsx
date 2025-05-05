import { FontAwesome } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useFocusEffect } from '@react-navigation/native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import React, { useEffect, useRef, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	Clipboard,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../App';
import {
	getFullAudioPath,
	processAudioForTranscription,
} from '../utils/audioProcessor';
import { formatTime } from '../utils/timeUtils';

// Define a type for our playback status to avoid TypeScript errors
interface PlaybackStatus {
	isLoaded: boolean;
	isPlaying?: boolean;
	durationMillis?: number;
	positionMillis?: number;
	didJustFinish?: boolean;
	error?: string;
}

type ReportScreenProps = NativeStackScreenProps<RootStackParamList, 'Report'>;

const ReportScreen: React.FC<ReportScreenProps> = ({ route, navigation }) => {
	const {
		audioUri: originalAudioUri,
		recordingId,
		transcription,
		recommendations,
		keepLocalFiles = true,
		isProcessing: initialProcessingState = true,
	} = route.params;

	// Use full audio path to ensure we find the file
	const audioUri = getFullAudioPath(originalAudioUri);

	const [isProcessing, setIsProcessing] = useState<boolean>(
		initialProcessingState
	);
	const [transcriptionLoading, setTranscriptionLoading] = useState<boolean>(
		initialProcessingState && !transcription
	);
	const [report, setReport] = useState<string | null>(null);
	const [sound, setSound] = useState<Audio.Sound | null>(null);
	const [isPlaying, setIsPlaying] = useState<boolean>(false);
	const [duration, setDuration] = useState<number>(0);
	const [position, setPosition] = useState<number>(0);
	const [sliderValue, setSliderValue] = useState<number>(0);
	const [isSliding, setIsSliding] = useState<boolean>(false);
	const [volume, setVolume] = useState<number>(1.0);
	const [playbackError, setPlaybackError] = useState<string | null>(null);
	const [unsavedChanges, setUnsavedChanges] = useState(false);
	const [showTranscription, setShowTranscription] = useState(false);
	const [activeTab, setActiveTab] = useState('audio'); // audio, data
	const [expandedTranscription, setExpandedTranscription] = useState(false);

	// Determine if we're viewing from history based on whether recordingId is provided
	const isViewingFromHistory = !!recordingId;

	// Use a ref for the timer to properly clean up
	const positionTimerRef = useRef<NodeJS.Timeout | null>(null);

	// Optional parameters from recording screen
	const recordingDuration = route.params?.recordingDuration;

	useEffect(() => {
		// Configure audio mode for playback
		const setupAudio = async () => {
			try {
				// Log the document directory path to understand where we're looking
				console.log('Document directory path:', FileSystem.documentDirectory);

				// Try to list files in the functions/audio directory
				try {
					const functionsDir = `${FileSystem.documentDirectory}functions/`;
					const serverAudioDir = `${functionsDir}audio/`;
					const files = await FileSystem.readDirectoryAsync(serverAudioDir);
					console.log('Files in audio directory:', files);

					// If our audioUri is empty but we have recordingTimestamp, try to find a matching file
					if (
						(!audioUri || audioUri === '') &&
						route.params.recordingTimestamp
					) {
						const timestamp = route.params.recordingTimestamp.toString();
						const matchingFiles = files.filter((file) =>
							file.includes(timestamp)
						);

						if (matchingFiles.length > 0) {
							console.log(
								'Found matching file by timestamp:',
								matchingFiles[0]
							);
							const fullPath = `${serverAudioDir}${matchingFiles[0]}`;
							// Skip the getFullAudioPath function since we already have the full path
							await setupSound(fullPath);
							return; // Exit early since we've handled the audio
						}
					}

					// If we have no URI but there are files, use the most recent one
					if ((!audioUri || audioUri === '') && files.length > 0) {
						// Sort files in reverse order to get most recent first (assuming timestamp in filename)
						const sortedFiles = [...files].sort().reverse();
						console.log(
							'No URI provided, using most recent file:',
							sortedFiles[0]
						);
						const fullPath = `${serverAudioDir}${sortedFiles[0]}`;
						await setupSound(fullPath);
						return; // Exit early since we've handled the audio
					}
				} catch (dirError) {
					console.log('Could not list audio directory:', dirError);
				}

				// Set audio mode for playback
				await Audio.setAudioModeAsync({
					allowsRecordingIOS: false, // We're playing, not recording
					playsInSilentModeIOS: true,
					staysActiveInBackground: true,
					interruptionModeIOS: 1, // Do not mix
					interruptionModeAndroid: 1, // Do not mix
					shouldDuckAndroid: true,
					playThroughEarpieceAndroid: false,
				});

				console.log('Audio mode set for playback');

				// Ensure server audio directory exists
				await ensureServerAudioDirectoryExists();

				// Process the audio first to get the processed audio path
				const processedAudioPath = await processAudio();

				// Use the processed audio path for the sound setup if available
				if (processedAudioPath) {
					await setupSound(processedAudioPath);
				} else {
					await setupSound();
				}
			} catch (error: any) {
				console.error('Failed to set up audio mode:', error);
				setPlaybackError(
					`Failed to set up audio: ${error.message || 'Unknown error'}`
				);
				setIsProcessing(false);
			}
		};

		setupAudio();

		// Clean up resources when component unmounts
		return () => {
			stopPositionTimer();
			if (sound) {
				console.log('Unloading sound');
				sound.unloadAsync();
			}
		};
	}, []);

	// Start position timer when playing, stop when paused
	useEffect(() => {
		if (isPlaying) {
			startPositionTimer();
		} else {
			stopPositionTimer();
		}
	}, [isPlaying]);

	const startPositionTimer = () => {
		stopPositionTimer(); // Clear any existing timer first

		// Update position every 100ms for smoother tracking
		positionTimerRef.current = setInterval(updatePlaybackStatus, 100);
	};

	const stopPositionTimer = () => {
		if (positionTimerRef.current) {
			clearInterval(positionTimerRef.current);
			positionTimerRef.current = null;
		}
	};

	const updatePlaybackStatus = async () => {
		if (!sound || isSliding) return;

		try {
			const status = await sound.getStatusAsync();

			if (status.isLoaded) {
				// Update position - make sure it's a number
				if (typeof status.positionMillis === 'number') {
					setPosition(status.positionMillis / 1000);
				}

				// Update slider value
				if (
					typeof status.positionMillis === 'number' &&
					typeof status.durationMillis === 'number' &&
					status.durationMillis > 0
				) {
					setSliderValue(status.positionMillis / status.durationMillis);

					// Log position for debugging - fixed to avoid undefined error
					console.log(
						`Position: ${status.positionMillis / 1000}s | Duration: ${
							typeof status.durationMillis === 'number'
								? status.durationMillis / 1000
								: 0
						}s`
					);
				}
			}
		} catch (error) {
			console.log('Error getting playback status:', error);
		}
	};

	const setupSound = async (audioPath?: string) => {
		try {
			// Use provided audioPath or default to audioUri
			const soundUri = audioPath || audioUri;
			console.log('Setting up sound with URI:', soundUri);

			if (!soundUri || soundUri === '') {
				console.log(
					'No valid audio URI provided, trying to find available audio files'
				);

				// Try to find available audio files
				const availableFiles = await findAvailableAudioFiles();

				if (availableFiles.length > 0) {
					// Sort in descending order to get most recent first (assuming timestamp in filename)
					availableFiles.sort().reverse();
					console.log(
						'Using most recent available audio file:',
						availableFiles[0]
					);

					// Create the sound with the first available file
					await setupSoundWithPath(availableFiles[0]);
					return;
				}

				throw new Error('No audio files found in audio directory');
			}

			await setupSoundWithPath(soundUri);
		} catch (error: any) {
			console.error('Failed to set up sound:', error);
			setPlaybackError(
				`Failed to set up audio playback: ${error.message || 'Unknown error'}`
			);
			setIsProcessing(false);
		}
	};

	// Helper function to set up sound with a valid path
	const setupSoundWithPath = async (soundUri: string) => {
		try {
			// Extract the filename from the audio URI safely
			let filename = '';
			try {
				filename = soundUri.split('/').pop() || '';
			} catch (error) {
				console.log('Error extracting filename from URI:', error);
			}

			// Use the route.params.audioUri as the original URI since that's what's passed
			// from the RecordingScreen
			if (!filename && route.params.audioUri) {
				try {
					filename = route.params.audioUri.split('/').pop() || '';
				} catch (error) {
					console.log('Error extracting filename from original URI:', error);
				}
			}

			// If we still don't have a filename, use a timestamp
			if (!filename) {
				filename = `${Date.now()}.m4a`;
			}

			console.log('Extracted filename for audio:', filename);

			// Create an array of possible paths to try
			const possiblePaths = [
				// Original URI
				soundUri,
				// Original URI without file:// prefix if it has one
				soundUri.startsWith('file://') ? soundUri.substring(7) : null,
				// Direct project path
				`functions/audio/${filename}`,
				// Expo document directory path
				FileSystem.documentDirectory
					? `${FileSystem.documentDirectory}functions/audio/${filename}`
					: null,
				// Timestamp-based path if available
				route.params.recordingTimestamp
					? `${FileSystem.documentDirectory}functions/audio/${route.params.recordingTimestamp}.m4a`
					: null,
				// Simple audio directory
				`audio/${filename}`,
			].filter(Boolean) as string[]; // Remove null values

			console.log('Trying these audio paths:', possiblePaths);

			// Try each path until one works
			let foundAudioPath = null;
			let fileInfo = null;

			for (const path of possiblePaths) {
				console.log('Checking path:', path);
				const info = await FileSystem.getInfoAsync(path);
				console.log('Path info:', info);

				if (info.exists) {
					console.log('Found audio file at:', path);
					foundAudioPath = path;
					fileInfo = info;
					break;
				}
			}

			// Try to find files with matching timestamp in audio directory
			if (!foundAudioPath) {
				try {
					const audioDir = `${FileSystem.documentDirectory}functions/audio/`;
					const files = await FileSystem.readDirectoryAsync(audioDir);
					console.log('Searching audio directory. Files found:', files);

					// Look for the file in the list
					for (const file of files) {
						if (filename && file.includes(filename.replace('.m4a', ''))) {
							const path = `${audioDir}${file}`;
							const info = await FileSystem.getInfoAsync(path);
							if (info.exists) {
								console.log('Found matching file by name:', path);
								foundAudioPath = path;
								fileInfo = info;
								break;
							}
						}
					}
				} catch (dirError) {
					console.log('Error searching audio directory:', dirError);
				}
			}

			// If we still didn't find the file AND we have a source audioUri
			if (
				!foundAudioPath &&
				route.params.audioUri &&
				!route.params.skipCopyingAudio
			) {
				try {
					console.log('Attempting to copy audio file from original URI');

					// Create the functions/audio directory if it doesn't exist
					const functionsDir = `${FileSystem.documentDirectory}functions/`;
					const audioDir = `${functionsDir}audio/`;

					// Create directories if needed
					const functionsDirInfo = await FileSystem.getInfoAsync(functionsDir);
					if (!functionsDirInfo.exists) {
						await FileSystem.makeDirectoryAsync(functionsDir, {
							intermediates: true,
						});
						console.log('Created functions directory');
					}

					const audioDirInfo = await FileSystem.getInfoAsync(audioDir);
					if (!audioDirInfo.exists) {
						await FileSystem.makeDirectoryAsync(audioDir, {
							intermediates: true,
						});
						console.log('Created audio directory');
					}

					// New path for the copied file
					const timestamp = Date.now();
					const newFilename = `${timestamp}_copy.m4a`;
					const newPath = `${audioDir}${newFilename}`;

					// Try to copy the file
					const sourceUri = route.params.audioUri;
					console.log(`Copying from ${sourceUri} to ${newPath}`);
					await FileSystem.copyAsync({
						from: sourceUri,
						to: newPath,
					});

					// Check if copy succeeded
					const newFileInfo = await FileSystem.getInfoAsync(newPath);
					if (newFileInfo.exists) {
						console.log('Successfully copied audio file to:', newPath);
						foundAudioPath = newPath;
						fileInfo = newFileInfo;
					}
				} catch (copyError) {
					console.error('Failed to copy audio file:', copyError);
				}
			}

			// Check if we found a valid file
			if (!foundAudioPath || !fileInfo || !fileInfo.exists) {
				setPlaybackError(
					`Could not find audio file. Tried paths: ${possiblePaths.join(', ')}`
				);
				setIsProcessing(false);
				return;
			}

			// Check if file has size
			const fileSize = (fileInfo as any).size || 0;
			if (fileSize === 0) {
				setPlaybackError('Audio file exists but is empty (0 bytes)');
				setIsProcessing(false);
				return;
			}

			console.log(`Audio file exists and has size: ${fileSize} bytes`);

			// Create the sound object
			const { sound: newSound } = await Audio.Sound.createAsync(
				{ uri: foundAudioPath },
				{
					shouldPlay: false,
					volume: volume,
					progressUpdateIntervalMillis: 100,
				},
				onPlaybackStatusUpdate
			);

			console.log('Sound created successfully');

			// Get initial status to set duration
			const initialStatus = await newSound.getStatusAsync();
			if (
				initialStatus.isLoaded &&
				typeof initialStatus.durationMillis === 'number'
			) {
				setDuration(initialStatus.durationMillis / 1000);
				console.log(
					`Initial duration: ${initialStatus.durationMillis / 1000}s`
				);
			}

			setSound(newSound);
			setIsProcessing(false);
		} catch (error: any) {
			console.error('Failed to set up sound with path:', error);
			throw error;
		}
	};

	const onPlaybackStatusUpdate = (status: any) => {
		// Log status updates for debugging
		console.log(
			'Status update:',
			status.isLoaded
				? `playing: ${status.isPlaying}, pos: ${
						status.positionMillis / 1000
				  }s, dur: ${status.durationMillis / 1000}s`
				: 'not loaded'
		);

		if (status.isLoaded) {
			// Update playing state
			setIsPlaying(status.isPlaying);

			// Update duration if available
			if (
				typeof status.durationMillis === 'number' &&
				status.durationMillis > 0
			) {
				setDuration(status.durationMillis / 1000);
			}

			// Update position if not currently sliding
			if (!isSliding && typeof status.positionMillis === 'number') {
				setPosition(status.positionMillis / 1000);

				// Update slider if duration is available
				if (
					typeof status.durationMillis === 'number' &&
					status.durationMillis > 0
				) {
					setSliderValue(status.positionMillis / status.durationMillis);
				}
			}

			// Handle playback finished
			if (status.didJustFinish) {
				console.log('Playback finished, resetting position');
				setIsPlaying(false);
				setPosition(0);
				setSliderValue(0);
				sound?.setPositionAsync(0);
			}
		} else if (status.error) {
			console.error('Playback error:', status.error);
			setPlaybackError(`Playback error: ${status.error}`);
		}
	};

	const processAudio = async () => {
		try {
			// Check if we already have a transcription from route params
			if (route.params.transcription) {
				console.log(
					'Already have transcription from params, skipping processing'
				);
				setIsProcessing(false);
				return null;
			}

			// If no audio URI, try to find available files
			if (!audioUri || audioUri === '') {
				console.log('No audio URI for processing, trying to find audio files');
				const availableFiles = await findAvailableAudioFiles();

				if (availableFiles.length > 0) {
					// Use the most recent file
					const mostRecentFile = availableFiles[0]; // already sorted in findAvailableAudioFiles
					console.log(
						'Using most recent audio file for processing:',
						mostRecentFile
					);
					return mostRecentFile;
				} else {
					console.log('No audio files found for processing');
					setIsProcessing(false);
					return null;
				}
			}

			// Extract the filename from the audio URI safely
			let filename = '';
			try {
				filename = audioUri.split('/').pop() || '';
			} catch (error) {
				console.log('Error extracting filename for processing:', error);
			}

			console.log('Extracted filename for processing:', filename);

			// Create an array of possible paths to try
			const possiblePaths = [
				// Original URI
				audioUri,
				// Expo document directory path
				FileSystem.documentDirectory
					? `${FileSystem.documentDirectory}functions/audio/${filename}`
					: null,
				// Direct project path
				`functions/audio/${filename}`,
				// Simple audio directory
				`audio/${filename}`,
			].filter(Boolean) as string[]; // Remove null values

			// Try each path until one works
			for (const path of possiblePaths) {
				try {
					console.log('Trying to process path:', path);
					const fileInfo = await FileSystem.getInfoAsync(path);
					console.log('File info for', path, ':', fileInfo);

					if (fileInfo.exists) {
						console.log('Found audio file at:', path);

						// We found a valid file, now check if we need to process it
						if (route.params.transcription) {
							console.log('Using existing transcription, skipping processing');
							setIsProcessing(false);
							return path;
						} else {
							// Process with our transcription function
							console.log('Processing audio for transcription...');
							setTranscriptionLoading(true);

							try {
								// Update existing transcription if available
								const result = await processAudioForTranscription(
									path,
									keepLocalFiles
								);
								console.log('Processing result:', result);

								if (result.transcript) {
									setTranscriptionLoading(false);
								}

								setIsProcessing(false);
								return path;
							} catch (processError) {
								console.error('Failed to process audio:', processError);
								setTranscriptionLoading(false);
								setIsProcessing(false);
								return path; // Still return the path even if processing failed
							}
						}
					}
				} catch (pathError) {
					console.log(`Error checking path ${path}:`, pathError);
				}
			}

			// If we get here, we couldn't find a valid file
			setIsProcessing(false);
			console.log('Could not find a valid audio file to process');
			return null;
		} catch (error) {
			console.error('Error in processAudio function:', error);
			setIsProcessing(false);
			return null;
		}
	};

	const togglePlayback = async () => {
		if (!sound) {
			Alert.alert('Error', 'Sound not properly initialized');
			return;
		}

		try {
			console.log('Toggling playback. Currently playing:', isPlaying);

			if (isPlaying) {
				await sound.pauseAsync();
				console.log('Audio paused');
			} else {
				const status = await sound.getStatusAsync();
				console.log('Current status before playing:', status);

				await sound.playAsync();
				console.log('Audio playing');
			}
		} catch (error: any) {
			console.error('Failed to toggle playback:', error);
			setPlaybackError(
				`Failed to play audio: ${error.message || 'Unknown error'}`
			);
		}
	};

	const handleSliderValueChange = (value: number) => {
		if (!isSliding) {
			setIsSliding(true);
		}
		setSliderValue(value);
	};

	const handleSliderComplete = async (value: number) => {
		if (sound && duration > 0) {
			const newPosition = value * duration * 1000; // Convert to milliseconds
			try {
				console.log(`Setting position to ${newPosition / 1000}s`);
				await sound.setPositionAsync(newPosition);
				setPosition(newPosition / 1000);
			} catch (error) {
				console.error('Failed to set position:', error);
			}
		}
		setIsSliding(false);
	};

	const handleVolumeChange = async (value: number) => {
		setVolume(value);
		if (sound) {
			try {
				await sound.setVolumeAsync(value);
			} catch (error) {
				console.error('Failed to set volume:', error);
			}
		}
	};

	const skipBackward = async () => {
		if (sound) {
			try {
				const newPosition = Math.max(0, position - 5) * 1000;
				console.log(`Skipping backward to ${newPosition / 1000}s`);
				await sound.setPositionAsync(newPosition);
				setPosition(newPosition / 1000);
				if (duration > 0) {
					setSliderValue(newPosition / (duration * 1000));
				}
			} catch (error) {
				console.error('Failed to skip backward:', error);
			}
		}
	};

	const skipForward = async () => {
		if (sound) {
			try {
				const newPosition = Math.min(duration, position + 5) * 1000;
				console.log(`Skipping forward to ${newPosition / 1000}s`);
				await sound.setPositionAsync(newPosition);
				setPosition(newPosition / 1000);
				if (duration > 0) {
					setSliderValue(newPosition / (duration * 1000));
				}
			} catch (error) {
				console.error('Failed to skip forward:', error);
			}
		}
	};

	const renderAudioPlayer = () => {
		if (isProcessing) {
			return (
				<View style={styles.loadingContainer}>
					<ActivityIndicator size='large' color='#007AFF' />
					<Text style={styles.loadingText}>Processing audio...</Text>
				</View>
			);
		}

		return (
			<View style={styles.audioPlayerContainer}>
				{playbackError && <Text style={styles.errorText}>{playbackError}</Text>}

				{/* Progress indicator */}
				<View style={styles.progressContainer}>
					<Text style={styles.timeText}>
						{formatTimeNoMilliseconds(position)}
					</Text>
					<View style={styles.sliderContainer}>
						<Slider
							value={sliderValue}
							onValueChange={handleSliderValueChange}
							onSlidingComplete={handleSliderComplete}
							minimumValue={0}
							maximumValue={1}
							minimumTrackTintColor='#007AFF'
							maximumTrackTintColor='#e0e0e0'
							thumbTintColor='#007AFF'
						/>
					</View>
					<Text style={styles.timeText}>
						{formatTimeNoMilliseconds(duration)}
					</Text>
				</View>

				{/* Playback controls */}
				<View style={styles.controlsContainer}>
					<TouchableOpacity onPress={skipBackward} style={styles.controlButton}>
						<FontAwesome name='backward' size={26} color='#555' />
					</TouchableOpacity>

					<TouchableOpacity onPress={togglePlayback} style={styles.playButton}>
						<FontAwesome
							style={{ marginLeft: 2 }}
							name={isPlaying ? 'pause' : 'play'}
							size={25}
							color='#fff'
						/>
					</TouchableOpacity>

					<TouchableOpacity onPress={skipForward} style={styles.controlButton}>
						<FontAwesome name='forward' size={26} color='#555' />
					</TouchableOpacity>
				</View>

				{/* Volume control */}
				<View style={styles.volumeContainer}>
					<FontAwesome name='volume-down' size={20} color='#555' />
					<Slider
						style={{ flex: 1, marginHorizontal: 10 }}
						value={volume}
						onValueChange={handleVolumeChange}
						minimumValue={0}
						maximumValue={1}
						minimumTrackTintColor='#007AFF'
						maximumTrackTintColor='#e0e0e0'
						thumbTintColor='#007AFF'
					/>
					<FontAwesome name='volume-up' size={20} color='#555' />
				</View>
			</View>
		);
	};

	useFocusEffect(
		React.useCallback(() => {
			// Set up a handler for the hardware back button
			const onBackPress = () => {
				if (unsavedChanges) {
					Alert.alert(
						'Unsaved Changes',
						'You have unsaved changes. Are you sure you want to go back?',
						[
							{ text: 'Stay', style: 'cancel', onPress: () => {} },
							{
								text: 'Discard',
								style: 'destructive',
								onPress: () => navigation.goBack(),
							},
						]
					);
					return true; // Prevent default behavior
				}
				return false; // Let default behavior happen
			};

			// Add event listener for hardware back button press on Android
			if (Platform.OS === 'android') {
				// This would normally use BackHandler but we'll omit for simplicity
			}

			return () => {
				// Clean up the event listener
				if (Platform.OS === 'android') {
					// This would normally remove BackHandler but we'll omit for simplicity
				}
			};
		}, [navigation, unsavedChanges])
	);

	const handleTextChange = (
		setText: React.Dispatch<React.SetStateAction<string>>,
		value: string
	) => {
		setText(value);
		setUnsavedChanges(true);
	};

	const handleSave = () => {
		// Here you would typically save the report to your database
		Alert.alert('Success', 'Report saved successfully');
		setUnsavedChanges(false);
		navigation.navigate('Main');
	};

	const renderTabs = () => {
		return (
			<View style={styles.tabsContainer}>
				<TouchableOpacity
					style={[styles.tab, activeTab === 'audio' && styles.activeTab]}
					onPress={() => setActiveTab('audio')}
				>
					<FontAwesome
						name='headphones'
						size={16}
						color={activeTab === 'audio' ? '#007AFF' : '#999'}
						style={styles.tabIcon}
					/>
					<Text
						style={[
							styles.tabText,
							activeTab === 'audio' && styles.activeTabText,
						]}
					>
						Audio
					</Text>
				</TouchableOpacity>

				<TouchableOpacity
					style={[styles.tab, activeTab === 'data' && styles.activeTab]}
					onPress={() => setActiveTab('data')}
				>
					<FontAwesome
						name='file-text-o'
						size={16}
						color={activeTab === 'data' ? '#007AFF' : '#999'}
						style={styles.tabIcon}
					/>
					<Text
						style={[
							styles.tabText,
							activeTab === 'data' && styles.activeTabText,
						]}
					>
						Report
					</Text>
				</TouchableOpacity>
			</View>
		);
	};

	const renderAudioTab = () => {
		return (
			<View style={styles.audioContainer}>
				{/* Backup legacy audio player */}
				<View style={styles.audioPlayerWrapper}>
					<Text style={styles.audioSectionTitle}>Audio Player</Text>
					{renderAudioPlayer()}
				</View>
			</View>
		);
	};

	const renderDataTab = () => {
		const recommendationsLoading =
			transcriptionLoading || (transcription && !recommendations);

		return (
			<View style={styles.tabContent}>
				{transcriptionLoading ? (
					<View style={styles.formSection}>
						<View style={styles.sectionHeader}>
							<FontAwesome
								name='file-text-o'
								size={18}
								color='#007AFF'
								style={styles.sectionIcon}
							/>
							<Text style={styles.sectionHeaderText}>Transcription</Text>
						</View>
						<View style={styles.loadingContainer}>
							<ActivityIndicator size='small' color='#007AFF' />
							<Text style={styles.loadingText}>
								Generating transcription...
							</Text>
						</View>
					</View>
				) : transcription ? (
					<View style={styles.formSection}>
						<View style={styles.sectionHeader}>
							<FontAwesome
								name='file-text-o'
								size={18}
								color='#007AFF'
								style={styles.sectionIcon}
							/>
							<Text style={styles.sectionHeaderText}>Transcription</Text>
							<View style={styles.transcriptionActions}>
								<TouchableOpacity
									onPress={() => {
										if (transcription) {
											Clipboard.setString(transcription);
											Alert.alert(
												'Copied',
												'Transcription copied to clipboard'
											);
										}
									}}
									style={styles.copyButton}
								>
									<FontAwesome name='copy' size={16} color='#007AFF' />
								</TouchableOpacity>
								<TouchableOpacity
									style={styles.toggleButton}
									onPress={() => setShowTranscription(!showTranscription)}
								>
									<Text style={styles.toggleText}>
										{showTranscription ? 'Hide' : 'Show'}
									</Text>
								</TouchableOpacity>
							</View>
						</View>
						{showTranscription && (
							<View style={styles.transcriptionContainer}>
								<Text style={styles.transcriptionText}>{transcription}</Text>
							</View>
						)}
					</View>
				) : null}

				{recommendationsLoading ? (
					<View style={styles.formSection}>
						<View style={styles.sectionHeader}>
							<FontAwesome
								name='lightbulb-o'
								size={18}
								color='#F5A623'
								style={styles.sectionIcon}
							/>
							<Text style={styles.sectionHeaderText}>AI Recommendations</Text>
						</View>
						<View style={styles.loadingContainer}>
							<ActivityIndicator size='small' color='#007AFF' />
							<Text style={styles.loadingText}>
								Generating medical recommendations...
							</Text>
						</View>
					</View>
				) : recommendations ? (
					<View style={styles.formSection}>
						<View style={styles.sectionHeader}>
							<FontAwesome
								name='lightbulb-o'
								size={18}
								color='#F5A623'
								style={styles.sectionIcon}
							/>
							<Text style={styles.sectionHeaderText}>AI Medical Report</Text>
							<TouchableOpacity
								onPress={() => {
									if (recommendations) {
										Clipboard.setString(recommendations);
										Alert.alert(
											'Copied',
											'Recommendations copied to clipboard'
										);
									}
								}}
								style={styles.copyButton}
							>
								<FontAwesome name='copy' size={16} color='#007AFF' />
							</TouchableOpacity>
						</View>
						<View style={styles.recommendationsContainer}>
							{recommendations.split('\n').map((line, index) => {
								// Check if line is a heading (starts with numbers followed by a dot or parenthesis)
								if (/^\d+[\)\.]\s/.test(line)) {
									return (
										<Text key={index} style={styles.recommendationHeading}>
											{line}
										</Text>
									);
								}
								// Check if line is a subheading (has leading dashes or asterisks)
								else if (/^\s*[-*]\s/.test(line)) {
									return (
										<Text key={index} style={styles.recommendationSubItem}>
											{line}
										</Text>
									);
								}
								// Handle bold text wrapped in ** or __
								else if (line.includes('**') || line.includes('__')) {
									return (
										<Text key={index} style={styles.recommendationBold}>
											{line.replace(/\*\*|__/g, '')}
										</Text>
									);
								} else {
									return (
										<Text key={index} style={styles.recommendationsText}>
											{line}
										</Text>
									);
								}
							})}
						</View>
					</View>
				) : null}
			</View>
		);
	};

	// Create functions/audio directory if it doesn't exist
	const ensureServerAudioDirectoryExists = async () => {
		try {
			console.log('Ensuring audio directories exist...');

			// Check if document directory is available
			if (!FileSystem.documentDirectory) {
				console.error('FileSystem.documentDirectory is not available');
				return;
			}

			// Path to functions/audio directory
			const functionsDir = `${FileSystem.documentDirectory}functions/`;
			const serverAudioDir = `${functionsDir}audio/`;

			console.log('Checking directories:');
			console.log('- Functions directory:', functionsDir);
			console.log('- Audio directory:', serverAudioDir);

			// Check if functions directory exists
			const functionsDirInfo = await FileSystem.getInfoAsync(functionsDir);
			console.log('Functions directory info:', functionsDirInfo);

			if (!functionsDirInfo.exists) {
				console.log('Creating functions directory:', functionsDir);
				await FileSystem.makeDirectoryAsync(functionsDir, {
					intermediates: true,
				});

				// Verify directory was created
				const verifyFunctionsDir = await FileSystem.getInfoAsync(functionsDir);
				if (verifyFunctionsDir.exists) {
					console.log('Functions directory created successfully');
				} else {
					console.error('Failed to create functions directory');
				}
			} else {
				console.log('Functions directory already exists');
			}

			// Check if audio directory exists
			const audioDirInfo = await FileSystem.getInfoAsync(serverAudioDir);
			console.log('Audio directory info:', audioDirInfo);

			if (!audioDirInfo.exists) {
				console.log('Creating server audio directory:', serverAudioDir);
				await FileSystem.makeDirectoryAsync(serverAudioDir, {
					intermediates: true,
				});

				// Verify directory was created
				const verifyAudioDir = await FileSystem.getInfoAsync(serverAudioDir);
				if (verifyAudioDir.exists) {
					console.log('Server audio directory created successfully');
				} else {
					console.error('Failed to create server audio directory');
				}
			} else {
				console.log('Server audio directory already exists');
			}

			// Try listing the contents of the audio directory
			try {
				const audioFiles = await FileSystem.readDirectoryAsync(serverAudioDir);
				console.log('Files in audio directory:', audioFiles);

				// If we have recordingTimestamp, try to find a matching file
				if (route.params.recordingTimestamp) {
					const timestamp = route.params.recordingTimestamp;
					const matchingFiles = audioFiles.filter((file) =>
						file.includes(timestamp.toString())
					);

					if (matchingFiles.length > 0) {
						console.log('Found files matching timestamp:', matchingFiles);

						// If we don't have a valid audioUri yet, use the first matching file
						if (!audioUri || audioUri === '') {
							const matchedFile = `${serverAudioDir}${matchingFiles[0]}`;
							console.log('Setting audioUri to matching file:', matchedFile);
							// We can't directly update audioUri as it's a constant, but we can
							// use this path in the setupSound function
							setupSound(matchedFile);
						}
					}
				}
			} catch (listError) {
				console.error('Error listing audio directory:', listError);
			}

			console.log('Server audio directory verification complete');
		} catch (error: any) {
			console.error('Error ensuring server audio directory exists:', error);
			// Don't throw an error, we'll let the code continue and try alternate paths
		}
	};

	// Utility function to find available audio files
	const findAvailableAudioFiles = async (): Promise<string[]> => {
		try {
			// Import the function at the top of your file
			const {
				getFirebaseSyncedAudioFiles,
			} = require('../utils/audioProcessor');

			// Get only audio files that have been synced with Firebase
			return await getFirebaseSyncedAudioFiles();
		} catch (error) {
			console.error('Error finding available audio files:', error);
			return [];
		}
	};

	// SimpleAudioPlayer component for more reliable audio playback
	const SimpleAudioPlayer = ({ timestamp }: { timestamp?: number }) => {
		const [sound, setSound] = useState<Audio.Sound | null>(null);
		const [isPlaying, setIsPlaying] = useState<boolean>(false);
		const [isLoading, setIsLoading] = useState<boolean>(true);
		const [errorMessage, setErrorMessage] = useState<string | null>(null);

		useEffect(() => {
			loadAudio();
			return () => {
				if (sound) {
					sound.unloadAsync();
				}
			};
		}, [timestamp]);

		const loadAudio = async () => {
			try {
				setIsLoading(true);
				setErrorMessage(null);

				// Try to find audio file using timestamp or most recent
				const audioPath = await findAudioPath();
				if (!audioPath) {
					throw new Error('Could not find audio file');
				}

				console.log('Loading audio from path:', audioPath);
				const { sound: newSound } = await Audio.Sound.createAsync(
					{ uri: audioPath },
					{ shouldPlay: false },
					onPlaybackStatusUpdate
				);

				setSound(newSound);
				setIsLoading(false);
			} catch (error: any) {
				console.error('Failed to load audio:', error);
				setErrorMessage(`Could not load audio: ${error.message}`);
				setIsLoading(false);
			}
		};

		const findAudioPath = async (): Promise<string | null> => {
			const audioDir = `${FileSystem.documentDirectory}functions/audio/`;

			// Make sure directory exists
			try {
				const dirInfo = await FileSystem.getInfoAsync(audioDir);
				if (!dirInfo.exists) {
					await FileSystem.makeDirectoryAsync(audioDir, {
						intermediates: true,
					});
					return null; // Directory was just created, so no files yet
				}
			} catch (error) {
				console.error('Error checking audio directory:', error);
				return null;
			}

			// Get list of audio files
			try {
				const files = await FileSystem.readDirectoryAsync(audioDir);
				if (files.length === 0) {
					return null;
				}

				// If timestamp provided, try to find matching file
				if (timestamp) {
					const timestampStr = timestamp.toString();
					const matchingFiles = files.filter((file) =>
						file.includes(timestampStr)
					);

					if (matchingFiles.length > 0) {
						return `${audioDir}${matchingFiles[0]}`;
					}
				}

				// Fall back to most recent file
				const sortedFiles = [...files].sort().reverse();
				return `${audioDir}${sortedFiles[0]}`;
			} catch (error) {
				console.error('Error listing audio files:', error);
				return null;
			}
		};

		const onPlaybackStatusUpdate = (status: any) => {
			if (status.isLoaded) {
				setIsPlaying(status.isPlaying);

				// Handle playback finished
				if (status.didJustFinish) {
					setIsPlaying(false);
				}
			}
		};

		const togglePlayback = async () => {
			if (!sound) return;

			try {
				if (isPlaying) {
					await sound.pauseAsync();
				} else {
					await sound.playAsync();
				}
			} catch (error) {
				console.error('Error toggling playback:', error);
			}
		};

		if (isLoading) {
			return (
				<View style={styles.simplePlayerContainer}>
					<ActivityIndicator size='small' color='#007AFF' />
					<Text style={styles.loadingText}>Loading audio...</Text>
				</View>
			);
		}

		if (errorMessage) {
			return (
				<View style={styles.simplePlayerContainer}>
					<Text style={styles.errorText}>{errorMessage}</Text>
					<TouchableOpacity style={styles.retryButton} onPress={loadAudio}>
						<Text style={styles.retryButtonText}>Retry</Text>
					</TouchableOpacity>
				</View>
			);
		}

		return (
			<View style={styles.simplePlayerContainer}>
				<TouchableOpacity style={styles.playButton} onPress={togglePlayback}>
					<FontAwesome
						name={isPlaying ? 'pause' : 'play'}
						size={24}
						color='#FFFFFF'
					/>
				</TouchableOpacity>
				<Text style={styles.playerText}>
					{timestamp ? new Date(timestamp).toLocaleTimeString() : 'Recording'}
				</Text>
			</View>
		);
	};

	// Helper function to format time with no milliseconds
	const formatTimeNoMilliseconds = (seconds: number): string => {
		return formatTime(Math.floor(seconds));
	};

	return (
		<SafeAreaView style={styles.container} edges={['top']}>
			<KeyboardAvoidingView
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				style={styles.keyboardAvoidView}
			>
				<View style={styles.header}>
					<TouchableOpacity
						style={styles.backButton}
						onPress={() => {
							if (unsavedChanges) {
								Alert.alert(
									'Unsaved Changes',
									'You have unsaved changes. Are you sure you want to go back?',
									[
										{ text: 'Stay', style: 'cancel', onPress: () => {} },
										{
											text: 'Discard',
											style: 'destructive',
											onPress: () => navigation.goBack(),
										},
									]
								);
							} else {
								navigation.goBack();
							}
						}}
					>
						<Text style={styles.backButtonText}>Back</Text>
					</TouchableOpacity>

					<Text style={styles.headerTitle}>Medical Report</Text>

					<TouchableOpacity style={styles.saveButton} onPress={handleSave}>
						<Text style={styles.saveButtonText}>Done</Text>
					</TouchableOpacity>
				</View>

				{renderTabs()}

				<ScrollView style={styles.formContainer}>
					{activeTab === 'audio' && renderAudioTab()}
					{activeTab === 'data' && renderDataTab()}
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#f6f6f6',
	},
	keyboardAvoidView: {
		flex: 1,
	},
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		padding: 16,
		paddingVertical: 20,
		backgroundColor: '#f6f6f6',
		borderBottomWidth: 1,
		borderBottomColor: '#e1e1e1',
	},
	headerTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: '#000',
	},
	backButton: {
		padding: 10,
	},
	backButtonText: {
		color: '#007AFF',
		fontSize: 17,
	},
	saveButton: {
		padding: 10,
	},
	saveButtonText: {
		color: '#007AFF',
		fontSize: 17,
		fontWeight: '600',
	},
	formContainer: {
		flex: 1,
		backgroundColor: '#f8f8f8',
	},
	simplePlayerContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 10,
		backgroundColor: '#f8f8f8',
		borderRadius: 8,
		marginVertical: 8,
	},
	playButton: {
		width: 60,
		height: 60,
		borderRadius: 30,
		backgroundColor: '#007AFF',
		alignItems: 'center',
		justifyContent: 'center',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.2,
		shadowRadius: 3,
		elevation: 3,
	},
	playerText: {
		fontSize: 15,
		color: '#333',
		marginLeft: 10,
	},
	retryButton: {
		padding: 8,
		borderRadius: 8,
		backgroundColor: '#007AFF',
		marginTop: 8,
	},
	retryButtonText: {
		color: 'white',
		fontWeight: '500',
		fontSize: 14,
	},
	errorText: {
		color: '#d32f2f',
		fontSize: 14,
		marginBottom: 8,
	},
	audioContainer: {
		padding: 20,
	},
	sectionTitle: {
		fontSize: 16,
		fontWeight: '500',
		color: '#333',
		marginBottom: 10,
	},
	audioErrorContainer: {
		padding: 15,
		backgroundColor: '#ffebee',
		borderRadius: 8,
		marginVertical: 10,
	},
	helpText: {
		color: '#555',
		fontSize: 13,
	},
	audioSectionTitle: {
		fontSize: 16,
		fontWeight: '500',
		color: '#555',
		marginTop: 20,
		marginBottom: 10,
	},
	divider: {
		height: 1,
		backgroundColor: '#e0e0e0',
		marginVertical: 15,
	},
	tabsContainer: {
		flexDirection: 'row',
		borderBottomWidth: 1,
		borderBottomColor: '#e1e1e1',
		backgroundColor: '#f9f9f9',
		paddingTop: 12,
		paddingBottom: 2,
	},
	tab: {
		flex: 1,
		paddingVertical: 14,
		paddingHorizontal: 12,
		alignItems: 'center',
		flexDirection: 'row',
		justifyContent: 'center',
		marginHorizontal: 4,
	},
	activeTab: {
		borderBottomWidth: 3,
		borderBottomColor: '#007AFF',
	},
	tabIcon: {
		marginRight: 8,
	},
	tabText: {
		fontSize: 15,
		color: '#666',
		fontWeight: '400',
	},
	activeTabText: {
		color: '#007AFF',
		fontWeight: '600',
	},
	loadingContainer: {
		padding: 30,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#f8f8f8',
		borderRadius: 12,
		margin: 16,
		marginHorizontal: 20,
	},
	loadingText: {
		marginTop: 12,
		color: '#666',
		fontSize: 14,
		fontWeight: '500',
	},
	audioPlayerContainer: {
		padding: 16,
		backgroundColor: '#f8f8f8',
		borderRadius: 12,
		marginVertical: 10,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.1,
		shadowRadius: 4,
		elevation: 2,
	},
	progressContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 16,
	},
	timeText: {
		fontSize: 14,
		color: '#555',
		width: 45,
		textAlign: 'center',
		fontWeight: '500',
	},
	sliderContainer: {
		flex: 1,
		marginHorizontal: 10,
	},
	controlsContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		marginVertical: 10,
		paddingVertical: 5,
	},
	controlButton: {
		paddingHorizontal: 42,
	},
	volumeContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginTop: 16,
		paddingHorizontal: 10,
		backgroundColor: '#f0f0f0',
		borderRadius: 20,
		padding: 8,
	},
	volumeSlider: {
		flex: 1,
		height: 40,
		marginHorizontal: 10,
	},
	buttonLabel: {
		fontSize: 10,
		color: '#666',
		marginTop: 2,
	},
	transcriptionHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 8,
	},
	transcriptionActions: {
		flexDirection: 'row',
		alignItems: 'center',
		marginLeft: 'auto',
	},
	copyButton: {
		marginLeft: 15,
		padding: 8,
		backgroundColor: '#f0f8ff',
		borderRadius: 20,
		width: 36,
		height: 36,
		alignItems: 'center',
		justifyContent: 'center',
	},
	toggleButton: {
		marginLeft: 12,
		backgroundColor: '#f0f8ff',
		paddingVertical: 6,
		paddingHorizontal: 12,
		borderRadius: 14,
	},
	toggleText: {
		width: 40,
		color: '#007AFF',
		fontSize: 14,
		fontWeight: '600',
	},
	transcriptionContainer: {
		backgroundColor: '#fbfbfb',
		padding: 20,
		margin: 16,
		marginHorizontal: 20,
		borderRadius: 12,
		borderLeftWidth: 3,
		borderLeftColor: '#007AFF',
	},
	transcriptionText: {
		fontSize: 15,
		color: '#444',
		lineHeight: 24,
	},
	recommendationsContainer: {
		backgroundColor: '#fffef7',
		padding: 20,
		margin: 16,
		marginHorizontal: 20,
		borderRadius: 12,
		borderLeftWidth: 3,
		borderLeftColor: '#F5A623',
	},
	recommendationHeading: {
		fontSize: 16,
		fontWeight: '700',
		color: '#333',
		marginBottom: 14,
		marginTop: 10,
	},
	recommendationSubItem: {
		fontSize: 15,
		color: '#555',
		marginBottom: 12,
		marginLeft: 20,
		lineHeight: 24,
	},
	recommendationBold: {
		fontSize: 16,
		fontWeight: '700',
		color: '#333',
		marginBottom: 14,
		marginTop: 4,
		backgroundColor: '#fffde6',
		padding: 10,
		borderRadius: 8,
	},
	recommendationsText: {
		fontSize: 15,
		color: '#444',
		lineHeight: 24,
		marginBottom: 12,
		marginTop: 2,
	},
	seeMoreButton: {
		marginTop: 8,
		alignSelf: 'flex-end',
		paddingVertical: 5,
		paddingHorizontal: 10,
	},
	tabContent: {
		flex: 1,
		padding: 16,
		paddingHorizontal: 12,
	},
	formSection: {
		marginBottom: 24,
		backgroundColor: '#fff',
		borderRadius: 16,
		overflow: 'hidden',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 4,
		borderWidth: 1,
		borderColor: '#f0f0f0',
		marginHorizontal: 8,
	},
	sectionHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 16,
		borderBottomWidth: 1,
		borderBottomColor: '#f0f0f0',
	},
	sectionIcon: {
		marginRight: 12,
		width: 24,
		textAlign: 'center',
	},
	sectionHeaderText: {
		fontSize: 17,
		fontWeight: '600',
		color: '#333',
		flex: 1,
		marginLeft: 4,
	},
	label: {
		fontSize: 14,
		fontWeight: '500',
		color: '#333',
		marginBottom: 8,
	},
	input: {
		borderWidth: 1,
		borderColor: '#e0e0e0',
		borderRadius: 8,
		padding: 10,
		marginBottom: 10,
	},
	multilineInput: {
		height: 100,
	},
	recordingInfo: {
		fontSize: 13,
		color: '#555',
		marginBottom: 10,
	},
	audioPlayerWrapper: {
		backgroundColor: '#ffffff',
		borderRadius: 16,
		padding: 16,
		marginTop: 10,
		marginHorizontal: 8,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 3 },
		shadowOpacity: 0.1,
		shadowRadius: 6,
		elevation: 3,
	},
});

export default ReportScreen;
