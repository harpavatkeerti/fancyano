import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import HomeScreen from './src/screens/HomeScreen';
import AdminDashboard from './src/screens/admin/DashboardScreen';
import AdminInventory from './src/screens/admin/InventoryScreen';
import AdminBookings from './src/screens/admin/BookingsScreen';
import AdminUsers from './src/screens/admin/UsersScreen';
import CustomerHome from './src/screens/customer/HomeScreen';
import CustomerProducts from './src/screens/customer/ProductsScreen';
import ProductDetail from './src/screens/customer/ProductDetailScreen';
import CustomerBookings from './src/screens/customer/BookingsScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <StatusBar style="auto" />
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen 
          name="Home" 
          component={HomeScreen} 
          options={{ title: 'Rental Booking System' }}
        />
        {/* Admin Screens */}
        <Stack.Screen 
          name="AdminDashboard" 
          component={AdminDashboard}
          options={{ title: 'Admin Dashboard' }}
        />
        <Stack.Screen 
          name="AdminInventory" 
          component={AdminInventory}
          options={{ title: 'Inventory' }}
        />
        <Stack.Screen 
          name="AdminBookings" 
          component={AdminBookings}
          options={{ title: 'Bookings' }}
        />
        <Stack.Screen 
          name="AdminUsers" 
          component={AdminUsers}
          options={{ title: 'User Management' }}
        />
        {/* Customer Screens */}
        <Stack.Screen 
          name="CustomerHome" 
          component={CustomerHome}
          options={{ title: 'Browse Products' }}
        />
        <Stack.Screen 
          name="CustomerProducts" 
          component={CustomerProducts}
          options={{ title: 'All Products' }}
        />
        <Stack.Screen 
          name="ProductDetail" 
          component={ProductDetail}
          options={{ title: 'Product Details' }}
        />
        <Stack.Screen 
          name="CustomerBookings" 
          component={CustomerBookings}
          options={{ title: 'My Bookings' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

