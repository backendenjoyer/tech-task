import { FontAwesome } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
	ActivityIndicator,
	Alert,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	TouchableOpacity,
	View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { clearLocalAudioFiles } from '../utils/audioProcessor';

const SettingsScreen: React.FC = () => {
	const [isDeleting, setIsDeleting] = useState(false);

	const renderSettingItem = (
		icon: string,
		title: string,
		description: string,
		toggle?: boolean,
		toggleValue?: boolean,
		onToggleChange?: (value: boolean) => void,
		onPress?: () => void
	) => (
		<TouchableOpacity
			style={styles.settingItem}
			onPress={onPress}
			disabled={!onPress}
		>
			<View style={styles.settingIcon}>
				<FontAwesome name={icon as any} size={22} color='#007AFF' />
			</View>

			<View style={styles.settingContent}>
				<Text style={styles.settingTitle}>{title}</Text>
				<Text style={styles.settingDescription}>{description}</Text>
			</View>

			{toggle && onToggleChange && toggleValue !== undefined && (
				<Switch
					value={toggleValue}
					onValueChange={onToggleChange}
					trackColor={{ false: '#ddd', true: '#007AFF' }}
					thumbColor='#fff'
				/>
			)}

			{!toggle && onPress && (
				<FontAwesome name='chevron-right' size={16} color='#999' />
			)}
		</TouchableOpacity>
	);

	const handleDeleteAllData = () => {
		Alert.alert(
			'Delete All Data',
			'Are you sure you want to delete all app data? This action cannot be undone.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Delete',
					style: 'destructive',
					onPress: async () => {
						try {
							setIsDeleting(true);

							// Delete local files only - server deletion happens in HistoryScreen
							await clearLocalAudioFiles();

							Alert.alert(
								'Success',
								'All local data has been cleared successfully.',
								[{ text: 'OK' }]
							);
						} catch (error: any) {
							Alert.alert(
								'Error',
								`Failed to clear app data: ${error.message}`,
								[{ text: 'OK' }]
							);
						} finally {
							setIsDeleting(false);
						}
					},
				},
			]
		);
	};

	const renderDeleteAllButton = () => (
		<TouchableOpacity
			style={[styles.dangerButton, isDeleting && styles.disabledButton]}
			onPress={handleDeleteAllData}
			disabled={isDeleting}
		>
			{isDeleting ? (
				<ActivityIndicator size='small' color='#fff' />
			) : (
				<>
					<FontAwesome
						name='trash'
						size={18}
						color='#fff'
						style={styles.buttonIcon}
					/>
					<Text style={styles.dangerButtonText}>Clear App Data</Text>
				</>
			)}
		</TouchableOpacity>
	);

	return (
		<SafeAreaView style={styles.container} edges={['top']}>
			<ScrollView style={styles.scrollContainer}>
				<View style={styles.dangerZone}>
					<Text style={styles.dangerZoneTitle}>Danger Zone</Text>
					<Text style={styles.dangerZoneDescription}>
						These actions are permanent and cannot be undone.
					</Text>
					{renderDeleteAllButton()}
				</View>

				<Text style={styles.sectionTitle}>About</Text>

				{renderSettingItem(
					'info-circle',
					'App Information',
					'Version, licenses, and legal information',
					false,
					undefined,
					undefined,
					() =>
						Alert.alert('App Info', 'DocNoteClone v1.0.0\n\n© 2025 Aleksey Kim')
				)}

				{renderSettingItem(
					'question-circle',
					'Help & Support',
					'Get assistance with using the app',
					false,
					undefined,
					undefined,
					() =>
						Alert.alert('Help & Support', 'Contact us at support@docnote.com')
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
	scrollContainer: {
		flex: 1,
		padding: 16,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: '#333',
		marginTop: 20,
		marginBottom: 16,
	},
	settingItem: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: 'white',
		borderRadius: 12,
		padding: 16,
		marginBottom: 10,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 2,
		elevation: 2,
	},
	settingIcon: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: '#f0f7ff',
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 16,
	},
	settingContent: {
		flex: 1,
	},
	settingTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#333',
		marginBottom: 4,
	},
	settingDescription: {
		fontSize: 14,
		color: '#666',
	},
	dangerZone: {
		backgroundColor: '#fff',
		borderRadius: 12,
		padding: 16,
		marginTop: 10,
		marginBottom: 20,
		borderWidth: 1,
		borderColor: '#ffdddd',
	},
	dangerZoneTitle: {
		fontSize: 16,
		fontWeight: '600',
		color: '#d33',
		marginBottom: 8,
	},
	dangerZoneDescription: {
		fontSize: 14,
		color: '#666',
		marginBottom: 16,
	},
	dangerButton: {
		backgroundColor: '#d33',
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderRadius: 8,
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
	},
	disabledButton: {
		opacity: 0.7,
	},
	buttonIcon: {
		marginRight: 8,
	},
	dangerButtonText: {
		color: 'white',
		fontSize: 16,
		fontWeight: '600',
	},
	versionText: {
		fontSize: 14,
		color: '#999',
		textAlign: 'center',
		marginTop: 30,
		marginBottom: 30,
	},
});

export default SettingsScreen;
