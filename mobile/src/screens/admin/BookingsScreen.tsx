import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, FlatList, Alert } from 'react-native';
import { bookingsApi } from '../../lib/api';
import { Booking } from '../../types';
import { Button, Input } from '../../components';

export default function AdminBookings() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchBookings();
  }, []);

  async function fetchBookings() {
    try {
      const response = await bookingsApi.getAll();
      setBookings(response.data);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      Alert.alert('Error', 'Failed to fetch bookings');
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel(id: number, customerName: string) {
    Alert.alert(
      'Cancel Booking',
      `Are you sure you want to cancel the booking with "${customerName}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await bookingsApi.update(id, { status: 'cancelled' });
              await fetchBookings();
            } catch (error) {
              Alert.alert('Error', 'Failed to cancel booking');
            }
          },
        },
      ]
    );
  }

  const filteredBookings = bookings.filter(
    (b) =>
      b.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (b.customer_phone && b.customer_phone.includes(searchTerm))
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return '#d1fae5';
      case 'cancelled':
        return '#fee2e2';
      case 'completed':
        return '#dbeafe';
      default:
        return '#fef3c7';
    }
  };

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case 'confirmed':
        return '#065f46';
      case 'cancelled':
        return '#991b1b';
      case 'completed':
        return '#1e40af';
      default:
        return '#92400e';
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading bookings...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bookings</Text>

      <Input
        placeholder="Search by customer name or phone..."
        value={searchTerm}
        onChangeText={setSearchTerm}
        style={styles.searchInput}
      />

      <Text style={styles.countText}>Total Orders: {bookings.length}</Text>

      <FlatList
        data={filteredBookings}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => {
          const products = Array.isArray(item.products) ? item.products : [];
          const productCount = products.length;
          return (
            <View style={styles.bookingCard}>
              <View style={styles.bookingHeader}>
                <Text style={styles.customerName}>{item.customer_name}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(item.status) },
                  ]}
                >
                  <Text style={[styles.statusText, { color: getStatusTextColor(item.status) }]}>
                    {item.status}
                  </Text>
                </View>
              </View>

              <View style={styles.bookingInfo}>
                <Text style={styles.infoText}>
                  Products: {productCount} {productCount === 1 ? 'item' : 'items'}
                </Text>
                <Text style={styles.infoText}>
                  Booking Date: {new Date(item.booking_date).toLocaleDateString("en-GB")}
                </Text>
                <Text style={styles.infoText}>
                  Period: {new Date(item.booked_from).toLocaleDateString("en-GB")} -{' '}
                  {new Date(item.booked_to).toLocaleDateString("en-GB")}
                </Text>
                {item.total_amount && (
                  <Text style={styles.amountText}>Amount: ₹{item.total_amount}</Text>
                )}
              </View>

              {item.status !== 'cancelled' && (
                <Button
                  title="Cancel Booking"
                  variant="danger"
                  onPress={() => handleCancel(item.id, item.customer_name)}
                  style={styles.cancelButton}
                />
              )}
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No bookings found</Text>
          </View>
        }
      />
    </View>
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
    marginBottom: 16,
    marginTop: 8,
  },
  searchInput: {
    marginBottom: 12,
  },
  countText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  bookingCard: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  customerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  bookingInfo: {
    marginBottom: 12,
  },
  infoText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  amountText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
    marginTop: 4,
  },
  cancelButton: {
    marginTop: 8,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
  },
});

