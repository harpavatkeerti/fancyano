import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { productsApi, bookingsApi } from '../../lib/api';
import { Product } from '../../types';
import { Button, Input } from '../../components';

export default function ProductDetail() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const productId = route.params?.productId;
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bookingData, setBookingData] = useState({
    customer_name: '',
    customer_phone: '',
    customer_address: '',
    booked_from: '',
    booked_to: '',
  });

  useEffect(() => {
    if (productId) {
      fetchProduct();
    }
  }, [productId]);

  async function fetchProduct() {
    try {
      const response = await productsApi.getById(productId);
      setProduct(response.data);
    } catch (error) {
      console.error('Error fetching product:', error);
      Alert.alert('Error', 'Failed to fetch product');
    } finally {
      setLoading(false);
    }
  }

  async function handleBooking() {
    if (!product) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      await bookingsApi.create({
        ...bookingData,
        booking_date: today,
        products: [{ id: product.id }],
        total_amount: calculateTotal(),
      });
      Alert.alert('Success', 'Booking created successfully!');
      navigation.navigate('CustomerBookings');
    } catch (error) {
      console.error('Error creating booking:', error);
      Alert.alert('Error', 'Failed to create booking');
    }
  }

  function calculateTotal() {
    if (!product || !bookingData.booked_from || !bookingData.booked_to) return 0;
    const from = new Date(bookingData.booked_from);
    const to = new Date(bookingData.booked_to);
    const days = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
    return days * product.rent_per_day;
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading product...</Text>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.container}>
        <Text>Product not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.productCard}>
        <Text style={styles.productName}>{product.name}</Text>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Product Code</Text>
          <Text style={styles.infoValue}>{product.code}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Rent per Day</Text>
          <Text style={styles.priceText}>₹{product.rent_per_day}</Text>
        </View>

        {product.category && (
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Category</Text>
            <Text style={styles.infoValue}>{product.category}</Text>
          </View>
        )}

        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Availability</Text>
          <View
            style={[
              styles.badge,
              product.availability ? styles.available : styles.unavailable,
            ]}
          >
            <Text style={styles.badgeText}>
              {product.availability ? 'Available' : 'Unavailable'}
            </Text>
          </View>
        </View>

        {product.description && (
          <View style={styles.descriptionContainer}>
            <Text style={styles.descriptionLabel}>Description</Text>
            <Text style={styles.descriptionText}>{product.description}</Text>
          </View>
        )}

        {product.availability && (
          <Button
            title="Book Now"
            onPress={() => setShowBookingForm(true)}
            style={styles.bookButton}
          />
        )}
      </View>

      {showBookingForm && (
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Booking</Text>

            <Input
              label="Your Name*"
              value={bookingData.customer_name}
              onChangeText={(text) => setBookingData({ ...bookingData, customer_name: text })}
              placeholder="Enter your name"
            />

            <Input
              label="Phone Number*"
              value={bookingData.customer_phone}
              onChangeText={(text) => setBookingData({ ...bookingData, customer_phone: text })}
              keyboardType="phone-pad"
              placeholder="Enter phone number"
            />

            <Input
              label="Address"
              value={bookingData.customer_address}
              onChangeText={(text) => setBookingData({ ...bookingData, customer_address: text })}
              placeholder="Enter address"
              multiline
              numberOfLines={3}
            />

            <Input
              label="From Date*"
              value={bookingData.booked_from}
              onChangeText={(text) => setBookingData({ ...bookingData, booked_from: text })}
              placeholder="YYYY-MM-DD"
            />

            <Input
              label="To Date*"
              value={bookingData.booked_to}
              onChangeText={(text) => setBookingData({ ...bookingData, booked_to: text })}
              placeholder="YYYY-MM-DD"
            />

            {bookingData.booked_from && bookingData.booked_to && (
              <View style={styles.totalContainer}>
                <Text style={styles.totalLabel}>Total Amount</Text>
                <Text style={styles.totalAmount}>₹{calculateTotal()}</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <Button title="Confirm Booking" onPress={handleBooking} style={styles.modalButton} />
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => setShowBookingForm(false)}
                style={styles.modalButton}
              />
            </View>
          </ScrollView>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    padding: 16,
  },
  productCard: {
    backgroundColor: '#ffffff',
    padding: 24,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  productName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  priceText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  available: {
    backgroundColor: '#d1fae5',
  },
  unavailable: {
    backgroundColor: '#fee2e2',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#065f46',
  },
  descriptionContainer: {
    marginTop: 16,
    marginBottom: 24,
  },
  descriptionLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 16,
    color: '#111827',
    lineHeight: 24,
  },
  bookButton: {
    marginTop: 8,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 24,
  },
  totalContainer: {
    backgroundColor: '#f3f4f6',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalButton: {
    flex: 1,
  },
});

