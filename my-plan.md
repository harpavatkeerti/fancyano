// create booking
add products, each product has rent, security, discount, penalty etc. as defined in @blueprint

discount is either absolute or percentage
for x percentage discount, effective_rent = rent / (1 + x/100)
for absolute discount, effective_rent = rent - discount

effective_rent is used for all further calculations unless otherwise stated explicitly as in some cases below

rent can be given per product or as a global discount or both. In case of global discount, it is distributed among the products in proportion to their original rents

Discount can only be given at the time of creating the booking, it can't be changed after that. We will add an admin override for any and all financials later.

At every point in time after creating booking, we should maintain minimum 50% of the total rent of all active products. Here total rent means all charges except security.


When we create a booking, we distribute the first payment into the rent paid section of all products proportionally to their effective_rent. As mentioned above, this needs to be atleast 50% of the total effective_rent.

If the amount > the total effective_rent of all products, then we fill the remaining amount to the other penalties if any. This is thoroughly described in the blueprint. 
Security for any product is only accepted if all other charges for all the products in the booking are paid. Once security for a product is paid completely, that signifies that the product is ready to be taken by the customer, and after that that product can not be exchanged or cancelled.

// cancel product 
A product can only be cancelled if no part of it's security has been paid.
If a product is cancelled, we levy a cancellation penalty based on policy. The policy applies on the effective_rent, this covers cases where the product had no discount or only per-product discount.

If that product had any share of global discount, we make the global discount 0. The total discount amount should be added along with the cancellation penalty as discount_reverted. So refund = product's effective rent - cancellation penalty - discount_reverted. If refund amount becomes negative, then show a warning popup and DO NOT ALLOW cancellation in that scenario. If refund remains positive, then that should be returned, and now since all products discounts are 0, their effective rents should be readjusted (will become equal to the original rent). The discounts which were reduced for them should be marked paid as adjustment to account for the fact that these were paid (as reduced from refund)

Before refunding, we should check if there are any due payments still pending in that booking (except security deposit). If yes, then refund amount should be added to the pending amount as adjustment. If still any amount is left after adjustment, that should be refunded.

// exchange product
A product can only be exchanged if no part of it's security has been paid.
If a product is exchanged, we levy an exchange penalty based on policy. The policy applies on the effective_rent, this covers cases where the product had no discount or only per-product discount.
There is no discount of any kind on the new products for which an old product is exchanged. If the total rent of new products is less than the effective rent of old product, the difference is charged as downgrade_penalty.

If the product had any share of global discount, then that share is set to 0. Global discount reduces accordingly, and the shares of global discount held by other products are unchanged.


class BookingStatus(Enum):
    PENDING = 'PENDING'
    CONFIRMED = 'CONFIRMED'
    IN_PROGRESS = 'IN_PROGRESS'
    PARTIALLY_COMPLETED = 'PARTIALLY_COMPLETED'
    COMPLETED = 'COMPLETED'
    CANCELLED = 'CANCELLED'

class BookingProductStatus(Enum):
    PENDING = 'PENDING'
    CONFIRMED = 'CONFIRMED'
    IN_PROGRESS = 'IN_PROGRESS'
    COMPLETED = 'COMPLETED'
    CANCELLED = 'CANCELLED'
    EXCHANGED = 'EXCHANGED'

class User:
    user_id: number | string
    name: string
    phone_number: string | null
    type: string // admin, salesman, customer
    email: string | null
    

class CustomerDetails:
    name: string
    phone_number: string
    alternate_phone_number: string


class BookingProductCharges:
    rent: number
    security_deposit: number
    late_fee: number
    damage_fee: number
    exchange_penalty: number
    cancellation_penalty: number
    downgrade_penalty: number
    effective_rent: number

class Booking:
    booking_id: number | string
    customer_details: CustomerDetails
    products: Array<BookingProduct>
    global_discount: number
    booking_start_data: DateTime
    booking_end_data: DateTime
    status: BookingStatus

class BookingProduct:
    product_id: number | string
    booking_id: number | string
    booked_from: DateTime
    booked_to: DateTime
    status: BookingProductStatus
    
    picked_up_at: DateTime | null
    picked_up_by: string | null // just name
    returned_at: DateTime | null
    returned_to: User

    due_charges: BookingProductCharges
    paid_charges: BookingProductCharges
    
    per_product_discount: number // absolute or percentage
    per_product_discount_type: 'absolute' | 'percentage'
    
    exchange_date: Exchange | null
    cancellation_data: Cancellation | null
    measurement_data: Measurement | null

    created_at: DateTime
    updated_at: DateTime

    created_by: User
    updated_by: User

class Exchange:
    exchange_id: number | string
    booking_id: number | string
    old_product_id: number | string
    new_product_ids: Array<number | string>
    exchange_date: DateTime
    
class Cancellation:
    cancellation_id: number | string
    booking_id: number | string
    product_id: number | string
    cancellation_date: DateTime

class Measurement:
    neck: number | null
    chest: number | null
    waist: number | null
    hip: number | null
    inseam: number | null
    shoulder: number | null
    special_requirements: string | null
    