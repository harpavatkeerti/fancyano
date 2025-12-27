import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';

export default function HomeScreen() {
  const navigation = useNavigation<any>();

  // Test API connection on mount
  useEffect(() => {
    const testConnection = async () => {
      try {
        const response = await fetch('http://192.168.29.233:3001/api/health');
        const data = await response.json();
        console.log('✅ API Connection OK:', data);
      } catch (error: any) {
        console.error('❌ API Connection Failed:', error);
        console.error('Error details:', error.message);
      }
    };
    testConnection();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Rental Booking System</Text>
      <View style={styles.cardContainer}>
        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('AdminDashboard')}
        >
          <Text style={styles.cardIcon}>👨‍💼</Text>
          <Text style={styles.cardTitle}>Admin Portal</Text>
          <Text style={styles.cardDescription}>Manage inventory, bookings, and users</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('CustomerHome')}
        >
          <Text style={styles.cardIcon}>👤</Text>
          <Text style={styles.cardTitle}>Customer Portal</Text>
          <Text style={styles.cardDescription}>Browse products and make bookings</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.card}
          onPress={() => navigation.navigate('AdminDashboard')}
        >
          <Text style={styles.cardIcon}>👔</Text>
          <Text style={styles.cardTitle}>Salesman Portal</Text>
          <Text style={styles.cardDescription}>Assist customers and manage bookings</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 32,
    marginTop: 20,
  },
  cardContainer: {
    gap: 16,
  },
  card: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    color: '#6b7280',
  },
});

