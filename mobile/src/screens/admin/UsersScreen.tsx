import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Alert } from 'react-native';
import { usersApi } from '../../lib/api';
import { User } from '../../types';
import { Button, Input } from '../../components';

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    role: 'customer' as 'admin' | 'salesman' | 'customer',
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const response = await usersApi.getAll();
      setUsers(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
      Alert.alert('Error', 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    try {
      if (editingUser) {
        await usersApi.update(editingUser.id, formData);
      } else {
        await usersApi.create(formData);
      }
      await fetchUsers();
      setShowAddModal(false);
      setEditingUser(null);
      resetForm();
      Alert.alert('Success', editingUser ? 'User updated' : 'User created');
    } catch (error) {
      console.error('Error saving user:', error);
      Alert.alert('Error', 'Failed to save user');
    }
  }

  function handleEdit(user: User) {
    setEditingUser(user);
    setFormData({
      name: user.name,
      phone: user.phone,
      role: user.role,
    });
    setShowAddModal(true);
  }

  async function handleDelete(id: number, userName: string) {
    Alert.alert(
      'Delete User',
      `Are you sure you want to remove user "${userName}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await usersApi.delete(id);
              await fetchUsers();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete user');
            }
          },
        },
      ]
    );
  }

  function resetForm() {
    setFormData({
      name: '',
      phone: '',
      role: 'customer',
    });
  }

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return '#e9d5ff';
      case 'salesman':
        return '#dbeafe';
      default:
        return '#e5e7eb';
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text>Loading users...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>User Management</Text>
        <Button
          title="+ Add User"
          onPress={() => {
            resetForm();
            setEditingUser(null);
            setShowAddModal(true);
          }}
        />
      </View>

      <FlatList
        data={users}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <View style={styles.userCard}>
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{item.name}</Text>
              <Text style={styles.userPhone}>{item.phone}</Text>
              <View style={[styles.roleBadge, { backgroundColor: getRoleColor(item.role) }]}>
                <Text style={styles.roleText}>{item.role}</Text>
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
                onPress={() => handleDelete(item.id, item.name)}
                style={styles.actionButton}
              />
            </View>
          </View>
        )}
      />

      {showAddModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingUser ? 'Edit User' : 'Add New User'}
            </Text>

            <Input
              label="Name*"
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
              placeholder="Enter name"
            />

            <Input
              label="Phone Number*"
              value={formData.phone}
              onChangeText={(text) => setFormData({ ...formData, phone: text })}
              keyboardType="phone-pad"
              placeholder="Enter phone number"
            />

            <View style={styles.roleContainer}>
              <Text style={styles.roleLabel}>Role</Text>
              {['admin', 'salesman', 'customer'].map((role) => (
                <Button
                  key={role}
                  title={role.charAt(0).toUpperCase() + role.slice(1)}
                  variant={formData.role === role ? 'primary' : 'secondary'}
                  onPress={() => setFormData({ ...formData, role: role as any })}
                  style={styles.roleButton}
                />
              ))}
            </View>

            <View style={styles.modalActions}>
              <Button
                title={editingUser ? 'Update' : 'Save'}
                onPress={handleSubmit}
                style={styles.modalButton}
              />
              <Button
                title="Cancel"
                variant="secondary"
                onPress={() => {
                  setShowAddModal(false);
                  setEditingUser(null);
                  resetForm();
                }}
                style={styles.modalButton}
              />
            </View>
          </View>
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
  userCard: {
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
  userInfo: {
    marginBottom: 12,
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  userPhone: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'capitalize',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
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
  roleContainer: {
    marginBottom: 16,
  },
  roleLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  roleButton: {
    marginBottom: 8,
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

