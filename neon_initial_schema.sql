-- Drop existing tables if any
  DROP TABLE IF EXISTS order_tags CASCADE;                                                                                                                                            
  DROP TABLE IF EXISTS order_items CASCADE;
  DROP TABLE IF EXISTS product_batches CASCADE;                                                                                                                                       
  DROP TABLE IF EXISTS orders CASCADE;                                                                                                                                                
  DROP TABLE IF EXISTS tags CASCADE;
  DROP TABLE IF EXISTS customers CASCADE;                                                                                                                                             
  DROP TABLE IF EXISTS products CASCADE;                                                                                                                                            
  DROP TABLE IF EXISTS feature_flags CASCADE;
                                                                                                                                                                                      
  -- Tables
                                                                                                                                                                                      
  CREATE TABLE public.customers (                                                                                                                                                   
      id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
      name text NOT NULL,
      phone text,                                                                                                                                                                     
      address text,
      created_at timestamp with time zone DEFAULT now(),                                                                                                                              
      email text,                                                                                                                                                                   
      user_id uuid,                           
      maps_link text                      
  );
                                                                                                                                                                                      
  CREATE TABLE public.feature_flags (
      id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,                                                                                                                         
      user_id uuid NOT NULL UNIQUE,                                                                                                                                                 
      ai_price_update boolean DEFAULT true NOT NULL,
      ai_order_fill boolean DEFAULT true NOT NULL,
      created_at timestamp with time zone DEFAULT now(),
      updated_at timestamp with time zone DEFAULT now()                                                                                                                               
  );                                      
                                                                                                                                                                                      
  CREATE TABLE public.products (                                                                                                                                                      
      id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
      name text NOT NULL,                                                                                                                                                             
      sku text UNIQUE,                                                                                                                                                              
      quantity numeric DEFAULT 0 NOT NULL,
      unit text DEFAULT 'litres' NOT NULL,    
      reorder_threshold numeric DEFAULT 10 NOT NULL,
      created_at timestamp with time zone DEFAULT now(),
      user_id uuid,                                                                                                                                                                   
      unit_size numeric DEFAULT 1 NOT NULL
  );                                                                                                                                                                                  
                                                                                                                                                                                      
  CREATE TABLE public.product_batches (
      id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,                                                                                                                         
      product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,                                                                                                    
      batch_number text NOT NULL,         
      number_of_bottles integer NOT NULL,
      bottle_size_litres numeric(10,3) NOT NULL,                                                                                                                                      
      manufacture_date date,
      expiry_date date,                                                                                                                                                               
      notes text,                                                                                                                                                                   
      user_id uuid,
      created_at timestamp with time zone DEFAULT now() NOT NULL,                                                                                                                     
      unit_price numeric DEFAULT 0 NOT NULL,
      cost_price numeric DEFAULT 0 NOT NULL,                                                                                                                                          
      quantity_litres numeric DEFAULT 0 NOT NULL,                                                                                                                                   
      CONSTRAINT product_batches_bottle_size_litres_check CHECK (bottle_size_litres > 0),
      CONSTRAINT product_batches_number_of_bottles_check CHECK (number_of_bottles >= 0),                                                                                              
      UNIQUE (product_id, batch_number)   
  );                                                                                                                                                                                  
                                                                                                                                                                                      
  CREATE INDEX product_batches_product_id_idx ON public.product_batches USING btree (product_id);
                                                                                                                                                                                      
  CREATE TABLE public.orders (                                                                                                                                                      
      id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,                                                                                                                         
      customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
      customer_name text,                                                                                                                                                             
      status text DEFAULT 'Pending' NOT NULL,                                                                                                                                       
      total_amount numeric DEFAULT 0 NOT NULL,
      notes text,                         
      order_date date DEFAULT CURRENT_DATE NOT NULL,
      created_at timestamp with time zone DEFAULT now(),                                                                                                                              
      payment_status text DEFAULT 'Unpaid' NOT NULL,
      user_id uuid,                                                                                                                                                                   
      payment_method text,                                                                                                                                                          
      amount_paid numeric DEFAULT 0,
      delivery_date date,                                                                                                                                                             
      delivery_charge numeric DEFAULT 0,
      receipt_number integer,                                                                                                                                                         
      CONSTRAINT orders_payment_method_check CHECK (payment_method = ANY (ARRAY['Cash','UPI'])),                                                                                    
      CONSTRAINT orders_payment_status_check CHECK (payment_status = ANY (ARRAY['Paid','Unpaid','Partial'])),
      CONSTRAINT orders_status_check CHECK (status = ANY (ARRAY['Pending','Packed','Delivered','Cancelled']))
  );                                                                                                                                                                                  
  
  CREATE TABLE public.order_items (                                                                                                                                                   
      id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,                                                                                                                       
      order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,                                                                                                                   
      product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,                                                                                                              
      product_name text,
      quantity numeric NOT NULL,                                                                                                                                                      
      unit_price numeric NOT NULL,                                                                                                                                                  
      subtotal numeric GENERATED ALWAYS AS (quantity * unit_price) STORED,
      cost_price numeric DEFAULT 0 NOT NULL,
      batch_id uuid REFERENCES public.product_batches(id) ON DELETE SET NULL                                                                                                          
  );                                          
                                                                                                                                                                                      
  CREATE TABLE public.tags (                                                                                                                                                        
      id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,                                                                                                                         
      name text NOT NULL,
      color text DEFAULT '#6366f1' NOT NULL,                                                                                                                                          
      user_id uuid,                                                                                                                                                                 
      created_at timestamp with time zone DEFAULT now(),
      UNIQUE (name, user_id)                  
  );                                      

  CREATE TABLE public.order_tags (                                                                                                                                                    
      order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
      tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,                                                                                                              
      PRIMARY KEY (order_id, tag_id)                                                                                                                                                
  );