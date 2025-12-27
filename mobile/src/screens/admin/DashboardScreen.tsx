import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { productsApi, bookingsApi } from '../../lib/api';

export default function AdminDashboard() {
  const navigation = useNavigation<any>();
  const [stats, setStats] = useState({
    urgentCases: 0,
    returnRate: 20,
    openUrgentCases: 0,
    totalProducts: 0,
    totalBookings: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  async function fetchDashboardData() {
    try {
      const [productsRes, bookingsRes] = await Promise.all([
        productsApi.getAll(),
        bookingsApi.getAll(),
      ]);

      const products = productsRes.data;
      const bookings = bookingsRes.data;

      const today = new Date();
      const urgentBookings = bookings.filter((b: any) => {
        const returnDate = new Date(b.booked_to);
        const daysUntilReturn = Math.ceil((returnDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return daysUntilReturn <= 2 && b.status !== 'completed' && b.status !== 'cancelled';
      });

      setStats({
        urgentCases: urgentBookings.length,
        returnRate: 20,
        openUrgentCases: urgentBookings.length,
        totalProducts: products.length,
        totalBookings: bookings.length,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading dashboard...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Dashboard</Text>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statIcon}>⚠️</Text>
          <Text style={styles.statValue}>{stats.urgentCases}</Text>
          <Text style={styles.statLabel}>Urgent Cases</Text>
          <Text style={styles.statSubtext}>20% from Oct'25</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statIcon}>📊</Text>
          <Text style={styles.statValue}>{stats.returnRate}%</Text>
          <Text style={styles.statLabel}>Return Rate</Text>
          <Text style={styles.statSubtext}>20% from Oct'25</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statIcon}>🔴</Text>
          <Text style={styles.statValue}>{stats.openUrgentCases}</Text>
          <Text style={styles.statLabel}>Open Urgent Cases</Text>
          <Text style={styles.statSubtext}>10 (Nov'25)</Text>
        </View>

        <View style={styles.statCard}>
          <Text style={styles.statIcon}>📦</Text>
          <Text style={styles.statValue}>{stats.totalProducts}</Text>
          <Text style={styles.statLabel}>Total Products</Text>
          <Text style={styles.statSubtext}>Active inventory</Text>
        </View>
      </View>

      <View style={styles.menuContainer}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('AdminInventory')}
        >
          <Text style={styles.menuIcon}>📦</Text>
          <Text style={styles.menuText}>Inventory</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('AdminBookings')}
        >
          <Text style={styles.menuIcon}>📅</Text>
          <Text style={styles.menuText}>Bookings</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => navigation.navigate('AdminUsers')}
        >
          <Text style={styles.menuIcon}>👥</Text>
          <Text style={styles.menuText}>User Management</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 24,
    marginTop: 8,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    width: '48%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  statSubtext: {
    fontSize: 12,
    color: '#9ca3af',
  },
  menuContainer: {
    gap: 12,
  },
  menuItem: {
    backgroundColor: '#ffffff',
    padding: 20,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  menuIcon: {
    fontSize: 24,
    marginRight: 16,
  },
  menuText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#111827',
  },
});

