// This will suppress the TypeScript errors related to module imports
declare module '@expo/vector-icons' {
	import { ComponentType } from 'react';

	export interface IconProps {
		name: any; // Using any to bypass strict type checking
		size?: number;
		color?: string;
		style?: any;
	}

	export const FontAwesome: ComponentType<IconProps>;
}

declare module '@react-navigation/bottom-tabs';
declare module '@react-navigation/native';
declare module '@react-navigation/native-stack';
declare module 'expo-status-bar';
declare module 'react-native-safe-area-context';
