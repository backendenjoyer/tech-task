import { FontAwesome } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import React, { useEffect, useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native';
import { RootStackParamList } from '../App';
import { processAudioForTranscription } from '../utils/audioProcessor';
import { formatTime } from '../utils/timeUtils';

type RecordingScreenProps = {
	navigation: NativeStackNavigationProp<RootStackParamList, 'Recording'>;
};

const RecordingScreen: React.FC<RecordingScreenProps> = ({ navigation }) => {
	const [recording, setRecording] = useState<Audio.Recording | null>(null);
	const [recordingStatus, setRecordingStatus] = useState<
		'idle' | 'recording' | 'paused' | 'processing' | 'transcribing'
	>('idle');
	const [audioUri, setAudioUri] = useState<string | null>(null);
	const [duration, setDuration] = useState<number>(0);
	const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);
	const [processingStatus, setProcessingStatus] = useState<string>('');
	const [isProcessing, setIsProcessing] = useState<boolean>(false);

	useEffect(() => {
		// Request permissions and set up audio mode when component mounts
		const setupAudio = async () => {
			try {
				// Request permissions
				const permissionResponse = await Audio.requestPermissionsAsync();
				if (!permissionResponse.granted) {
					throw new Error('Microphone permission not granted');
				}

				// Configure audio mode
				await Audio.setAudioModeAsync({
					allowsRecordingIOS: true,
					playsInSilentModeIOS: true,
					staysActiveInBackground: true,
					// Use numeric values for interruption modes since the enum structure changed
					interruptionModeIOS: 1, // 1 = do not mix
					interruptionModeAndroid: 1, // 1 = do not mix
				});

				console.log('Audio mode set successfully');
			} catch (error) {
				console.error('Error setting up audio:', error);
				Alert.alert('Permission Error', 'Failed to get microphone permissions');
			}
		};

		setupAudio();

		// Clean up timer and reset state when component unmounts
		return () => {
			console.log('Cleaning up RecordingScreen resources');
			if (timer) clearInterval(timer);
			// Release any recording in progress if component unmounts
			if (recording) {
				(async () => {
					try {
						await recording.stopAndUnloadAsync();
					} catch (error) {
						console.error('Error stopping recording during cleanup:', error);
					}
				})();
			}
		};
	}, []);

	// Add navigation listener to reset processing state if user navigates away
	useEffect(() => {
		const unsubscribe = navigation.addListener('beforeRemove', () => {
			console.log('Navigation away from recording screen, resetting state');
			setIsProcessing(false);
			setRecordingStatus('idle');
		});

		return unsubscribe;
	}, [navigation]);

	const startRecording = async () => {
		try {
			// Clear previous recording if exists
			if (recording) {
				await recording.stopAndUnloadAsync();
			}

			// Create new recording instance
			const { recording: newRecording } = await Audio.Recording.createAsync(
				Audio.RecordingOptionsPresets.HIGH_QUALITY
			);

			setRecording(newRecording);
			setRecordingStatus('recording');
			setDuration(0);

			// Start timer for recording duration
			const newTimer = setInterval(() => {
				setDuration((prev) => prev + 1);
			}, 1000);

			setTimer(newTimer);
		} catch (error) {
			console.error('Failed to start recording', error);
			Alert.alert('Error', 'Failed to start recording');
		}
	};

	const pauseRecording = async () => {
		if (!recording) return;

		try {
			await recording.pauseAsync();
			setRecordingStatus('paused');

			// Clear timer
			if (timer) {
				clearInterval(timer);
				setTimer(null);
			}
		} catch (error) {
			console.error('Failed to pause recording', error);
			Alert.alert('Error', 'Failed to pause recording');
		}
	};

	const resumeRecording = async () => {
		if (!recording) return;

		try {
			await recording.startAsync();
			setRecordingStatus('recording');

			// Resume timer
			const newTimer = setInterval(() => {
				setDuration((prev) => prev + 1);
			}, 1000);

			setTimer(newTimer);
		} catch (error) {
			console.error('Failed to resume recording', error);
			Alert.alert('Error', 'Failed to resume recording');
		}
	};

	const stopRecording = async () => {
		if (!recording) return;

		// Prevent duplicate processing
		if (isProcessing) {
			console.log('Already processing a recording, ignoring duplicate call');
			return;
		}

		setIsProcessing(true);

		try {
			await recording.stopAndUnloadAsync();
			const uri = recording.getURI();
			setAudioUri(uri || null);

			// Set the recording status to processing (for loading UI)
			setRecordingStatus('processing');
			setProcessingStatus('Saving recording...');

			// Clear timer
			if (timer) {
				clearInterval(timer);
				setTimer(null);
			}

			// Only proceed if we have a URI
			if (uri) {
				// Check if the file exists before navigating
				try {
					console.log('Checking if recording file exists at:', uri);
					const fileInfo = await FileSystem.getInfoAsync(uri);
					console.log('File info:', fileInfo);

					if (!fileInfo.exists) {
						throw new Error('Recording file not found');
					}

					// Ensure the file has content
					const fileSize = fileInfo.size || 0;
					if (fileSize === 0) {
						throw new Error('Recording file is empty');
					}

					console.log(`Recording file exists and has size: ${fileSize} bytes`);

					// Generate a filename with timestamp - this will be our stable identifier
					const timestamp = Date.now();
					const fileName = `${timestamp}.m4a`;

					// Always save to the document directory's functions/audio folder
					// This is our consistent, predictable location
					const functionsDir = `${FileSystem.documentDirectory}functions/`;
					const audioDir = `${functionsDir}audio/`;

					// Ensure directories exist
					await FileSystem.makeDirectoryAsync(functionsDir, {
						intermediates: true,
					});
					await FileSystem.makeDirectoryAsync(audioDir, {
						intermediates: true,
					});

					// The path where we'll always store the file
					const finalAudioPath = `${audioDir}${fileName}`;
					console.log(
						'Saving recording to consistent location:',
						finalAudioPath
					);

					// Copy the recording to our consistent location
					await FileSystem.copyAsync({
						from: uri,
						to: finalAudioPath,
					});

					// Verify the file was copied successfully
					const finalFileInfo = await FileSystem.getInfoAsync(finalAudioPath);
					if (!finalFileInfo.exists || finalFileInfo.size === 0) {
						throw new Error('Failed to save recording to consistent location');
					}

					console.log('Successfully saved recording to:', finalAudioPath);

					// Process the audio through OpenAI before navigating
					try {
						// Update status to show we're transcribing
						setRecordingStatus('transcribing');
						setProcessingStatus('Processing audio with AI...');

						// Process audio for transcription using our utility function
						console.log('Starting audio processing with AI...');
						const result = await processAudioForTranscription(
							finalAudioPath,
							true
						);
						console.log('Audio processing complete:', result);

						// Now navigate with all the data
						navigation.navigate('Report', {
							// Pass the timestamp as the primary identifier instead of the full URI
							recordingTimestamp: timestamp,
							// Still include the URI as a fallback
							audioUri: finalAudioPath,
							isProcessing: false,
							keepLocalFiles: true,
							recordingDuration: duration,
							transcription: result.transcript,
							recommendations: result.recommendations,
							skipCopyingAudio: true,
						});

						// Reset state after successful navigation
						setIsProcessing(false);
					} catch (processingError: any) {
						console.error(
							'Error processing audio with AI:',
							processingError
						);

						// Still navigate but without the processed data
						Alert.alert(
							'Processing Issue',
							'There was an issue processing your audio. You can still review the recording.',
							[
								{
									text: 'Continue',
									onPress: () => {
										navigation.navigate('Report', {
											recordingTimestamp: timestamp,
											audioUri: finalAudioPath,
											isProcessing: false,
											keepLocalFiles: true,
											recordingDuration: duration,
											skipCopyingAudio: true,
										});

										// Reset state after navigation
										setIsProcessing(false);
									},
								},
							]
						);
					}
				} catch (error: any) {
					console.error('Failed to process audio file:', error);
					setRecordingStatus('idle');
					setIsProcessing(false);
					Alert.alert(
						'Error',
						`Failed to prepare audio file: ${error.message}`
					);
				}
			} else {
				setRecordingStatus('idle');
				setIsProcessing(false);
				Alert.alert('Error', 'No recording URI was returned');
			}
		} catch (error: any) {
			console.error('Failed to stop recording:', error);
			setRecordingStatus('idle');
			setIsProcessing(false);
			Alert.alert('Error', 'Failed to stop recording');
		}
	};

	return (
		<View style={styles.container}>
			<View style={styles.timerContainer}>
				<Text style={styles.timerText}>{formatTime(duration)}</Text>
				<Text style={styles.statusText}>
					{recordingStatus === 'idle'
						? 'Ready to Record'
						: recordingStatus === 'recording'
						? 'Recording...'
						: recordingStatus === 'paused'
						? 'Paused'
						: recordingStatus === 'transcribing'
						? 'Transcribing audio...'
						: 'Processing...'}
				</Text>
				{(recordingStatus === 'processing' ||
					recordingStatus === 'transcribing') && (
					<Text style={styles.processingText}>{processingStatus}</Text>
				)}
			</View>

			<View style={styles.controlsContainer}>
				{recordingStatus === 'idle' ? (
					<TouchableOpacity
						style={styles.recordButton}
						onPress={startRecording}
					>
						<FontAwesome name='microphone' size={40} color='#fff' />
					</TouchableOpacity>
				) : recordingStatus === 'processing' ||
				  recordingStatus === 'transcribing' ? (
					<View style={styles.loadingContainer}>
						<ActivityIndicator size='large' color='#007AFF' />
						<Text style={styles.loadingText}>
							{recordingStatus === 'transcribing'
								? 'This may take a minute...'
								: 'Processing audio...'}
						</Text>
					</View>
				) : (
					<View style={styles.activeControlsRow}>
						{recordingStatus === 'recording' ? (
							<TouchableOpacity
								style={styles.controlButton}
								onPress={pauseRecording}
							>
								<FontAwesome name='pause' size={30} color='#fff' />
							</TouchableOpacity>
						) : (
							<TouchableOpacity
								style={styles.controlButton}
								onPress={resumeRecording}
							>
								<FontAwesome name='play' size={30} color='#fff' />
							</TouchableOpacity>
						)}

						<TouchableOpacity style={styles.stopButton} onPress={stopRecording}>
							<FontAwesome name='stop' size={30} color='#fff' />
						</TouchableOpacity>
					</View>
				)}
			</View>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: '#f5f5f7',
		alignItems: 'center',
		justifyContent: 'center',
		padding: 20,
	},
	timerContainer: {
		alignItems: 'center',
		marginBottom: 60,
	},
	timerText: {
		fontSize: 56,
		fontWeight: '200',
		color: '#333',
	},
	statusText: {
		fontSize: 18,
		color: '#666',
		marginTop: 10,
	},
	processingText: {
		fontSize: 14,
		color: '#007AFF',
		marginTop: 8,
	},
	controlsContainer: {
		alignItems: 'center',
	},
	recordButton: {
		width: 80,
		height: 80,
		borderRadius: 40,
		backgroundColor: '#FF3B30',
		alignItems: 'center',
		justifyContent: 'center',
	},
	activeControlsRow: {
		// marginRight: 10,

		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-around',
		width: '80%',
	},
	controlButton: {
		width: 70,
		height: 70,
		borderRadius: 35,
		backgroundColor: '#007AFF',
		alignItems: 'center',
		justifyContent: 'center',
	},
	stopButton: {
		width: 70,
		height: 70,
		borderRadius: 35,
		backgroundColor: '#FF3B30',
		alignItems: 'center',
		justifyContent: 'center',
		marginRight: 25,
	},
	loadingContainer: {
		alignItems: 'center',
		justifyContent: 'center',
	},
	loadingText: {
		fontSize: 16,
		color: '#666',
		marginTop: 12,
	},
});

export default RecordingScreen;
