import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList, Alert } from 'react-native';
import { productsApi } from '../../lib/api';
import { Product } from '../../types';
import { Button, Input } from '../../components';
import { useNavigation } from '@react-navigation/native';

export default function AdminInventory() {
  const navigation = useNavigation<any>();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    rent_per_day: '',
    category: '',
    description: '',
    availability: true,
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  async function fetchProducts() {
    try {
      const response = await productsApi.getAll();
      setProducts(response.data);
    } catch (error) {
      console.error('Error fetching products:', error);
      Alert.alert('Error', 'Failed to fetch products');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    try {
      if (editingProduct) {
        await productsApi.update(editingProduct.id, formData);
      } else {
        await productsApi.create({
          ...formData,
          rent_per_day: parseFloat(formData.rent_per_day),
        });
      }
      await fetchProducts();
      setShowAddModal(false);
      setEditingProduct(null);
      resetForm();
      Alert.alert('Success', editingProduct ? 'Product updated' : 'Product created');
    } catch (error) {
      console.error('Error saving product:', error);
      Alert.alert('Error', 'Failed to save product');
    }
  }

  function handleEdit(product: Product) {
    setEditingProduct(product);
    setFormData({
      name: product.name,
      code: product.code,
      rent_per_day: product.rent_per_day.toString(),
      category: product.category || '',
      description: product.description || '',
      availability: product.availability,
    });
    setShowAddModal(true);
  }

  async function handleDelete(id: number) {
    Alert.alert('Delete Product', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await productsApi.delete(id);
            await fetchProducts();
          } catch (error) {
            Alert.alert('Error', 'Failed to delete product');
          }
        },
      },
    ]);
  }

  function resetForm() {
    setFormData({
      name: '',
      code: '',
      rent_per_day: '',
      category: '',
      description: '',
      availability: true,
    });
  }

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading inventory...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
        <Button
          title="+ Add Product"
          onPress={() => {
            resetForm();
            setEditingProduct(null);
            setShowAddModal(true);
          }}
        />
      </View>

      <Input
        placeholder="Search products..."
        value={searchTerm}
        onChangeText={setSearchTerm}
        style={styles.searchInput}
      />

      <Text style={styles.countText}>Total Products: {products.length}</Text>

      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.productCard}>
            <View style={styles.productInfo}>
              <Text style={styles.productName}>{item.name}</Text>
              <Text style={styles.productCode}>Code: {item.code}</Text>
              <Text style={styles.productPrice}>₹{item.rent_per_day}/day</Text>
              <View style={[styles.badge, item.availability ? styles.available : styles.unavailable]}>
                <Text style={styles.badgeText}>{item.availability ? 'Available' : 'Unavailable'}</Text>
              </View>
            </View>
            <View style={styles.actions}>
              <Button
                title="Edit"
                variant="secondary"
                onPress={() => handleEdit(item)}
                style={styles.actionButton}
              />
              <Button
                title="Delete"
                variant="danger"
                onPress={() => handleDelete(item.id)}
                style={styles.actionButton}
              />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No products found</Text>
          </View>
        }
      />

      {showAddModal && (
        <View style={styles.modalOverlay}>
          <ScrollView style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingProduct ? 'Edit Product' : 'Add Product'}
            </Text>

            <Input
              label="Product Name"
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
              placeholder="Enter product name"
            />

            <Input
              label="Product Code"
              value={formData.code}
              onChangeText={(text) => setFormData({ ...formData, code: text })}
              placeholder="Enter product code"
            />

            <Input
              label="Rent per Day (₹)"
              value={formData.rent_per_day}
              onChangeText={(text) => setFormData({ ...formData, rent_per_day: text })}
              keyboardType="numeric"
              placeholder="0.00"
            />

            <Input
              label="Category"
              value={formData.category}
              onChangeText={(text) => setFormData({ ...formData, category: text })}
              placeholder="Enter category"
            />

            <Input
              label="Description"
              value={formData.description}
              onChangeText={(text) => setFormData({ ...formData, description: text })}
              placeholder="Enter description"
              multiline
              numberOfLines={3}
            />

            <View style={styles.checkboxContainer}>
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => setFormData({ ...formData, availability: !formData.availability })}
              >
                <Text>{formData.availability ? '☑' : '☐'}</Text>
                <Text style={styles.checkboxLabel}>Available</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalActions}>
              <Button
                title={editingProduct ? 'Update' : 'Create'}
                onPress={handleSubmit}
                style={styles.modalButton}
              />
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => {
                  setShowAddModal(false);
                  setEditingProduct(null);
                  resetForm();
                }}
                style={styles.modalButton}
              />
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
  },
  searchInput: {
    marginBottom: 12,
  },
  countText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  productCard: {
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
  productInfo: {
    marginBottom: 12,
  },
  productName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  productCode: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
    marginBottom: 8,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
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
    fontWeight: '500',
    color: '#065f46',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
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
  checkboxContainer: {
    marginBottom: 16,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxLabel: {
    marginLeft: 8,
    fontSize: 16,
    color: '#374151',
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

