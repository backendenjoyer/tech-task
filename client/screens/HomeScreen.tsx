import { FontAwesome } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RootStackParamList } from '../App';
import { auth } from '../firebaseInit'; // Import auth from firebaseInit

type HomeScreenProps = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Main'>;
};

const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setLoading(false);
      if (user) {
        console.log('User is signed in:', user.email);
        // User is authenticated, stay on HomeScreen
      } else {
        console.log('No user signed in');
        // Navigate to SignIn screen
        navigation.navigate('SignIn'); // Assumes a SignIn screen exists
      }
    });

    return () => unsubscribe(); // Cleanup on unmount
  }, [navigation]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Text>Loading...</Text>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <Text>{error}</Text>
        <TouchableOpacity onPress={() => navigation.navigate('SignIn')}>
          <Text>Go to Sign-In</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.contentContainer}>
        <Text style={styles.title}>DocNote</Text>
        <Text style={styles.subtitle}>
          Record audio and generate medical reports
        </Text>

        <View style={styles.imageContainer}>
          <Image
            source={require('../assets/icon.png')}
            style={styles.image}
            resizeMode="contain"
          />
        </View>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Recording')}
        >
          <FontAwesome
            name="microphone"
            size={24}
            color="#fff"
            style={styles.buttonIcon}
          />
          <Text style={styles.buttonText}>Start Recording</Text>
        </TouchableOpacity>

        <View style={styles.infoContainer}>
          <View style={styles.infoItem}>
            <FontAwesome name="file-text-o" size={20} color="#007AFF" />
            <Text style={styles.infoText}>Create detailed medical reports</Text>
          </View>

          <View style={styles.infoItem}>
            <FontAwesome name="clock-o" size={20} color="#007AFF" />
            <Text style={styles.infoText}>Save time on documentation</Text>
          </View>

          <View style={styles.infoItem}>
            <FontAwesome name="lock" size={20} color="#007AFF" />
            <Text style={styles.infoText}>Secure and private</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f7',
  },
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
    color: '#007AFF',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 30,
    textAlign: 'center',
    color: '#333',
  },
  imageContainer: {
    width: 150,
    height: 150,
    marginBottom: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  button: {
    flexDirection: 'row',
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#007AFF',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 8,
  },
  buttonIcon: {
    marginRight: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  infoContainer: {
    marginTop: 40,
    width: '100%',
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  infoText: {
    fontSize: 16,
    marginLeft: 15,
    color: '#333',
  },
});

export default HomeScreen;