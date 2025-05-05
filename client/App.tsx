import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { FontAwesome } from '@expo/vector-icons';
import HomeScreen from './screens/HomeScreen';
import HistoryScreen from './screens/HistoryScreen';
import RecordingScreen from './screens/RecordingScreen'; // Adjust path as needed
import ReportScreen from './screens/ReportScreen'; // Adjust path as needed
import SignInScreen from './screens/SignInScreen';

export type RootStackParamList = {
  Main: undefined;
  SignIn: undefined;
  Recording: undefined;
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

export type TabParamList = {
  Home: undefined;
  History: undefined;
  Recording: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TabNavigator = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      tabBarIcon: ({ color, size }) => {
        let iconName: string;
        if (route.name === 'Home') iconName = 'home';
        else if (route.name === 'History') iconName = 'history';
        else iconName = 'microphone';
        return <FontAwesome name={iconName as any} size={size} color={color} />;
      },
    })}
  >
    <Tab.Screen name="Home" component={HomeScreen} />
    <Tab.Screen name="History" component={HistoryScreen} />
    <Tab.Screen name="Recording" component={RecordingScreen} />
  </Tab.Navigator>
);

const App = () => (
  <NavigationContainer>
    <Stack.Navigator>
      <Stack.Screen
        name="SignIn"
        component={SignInScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Main"
        component={TabNavigator}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Report" component={ReportScreen} />
    </Stack.Navigator>
  </NavigationContainer>
);

export default App;