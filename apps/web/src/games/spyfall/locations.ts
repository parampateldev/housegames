export type LocationDef = { name: string; roles: string[] };

export const LOCATIONS: LocationDef[] = [
  { name: 'Airplane', roles: ['Pilot', 'Flight Attendant', 'Air Marshal', 'Mechanic', 'First Class Passenger', 'Economy Passenger'] },
  { name: 'Bank', roles: ['Teller', 'Security Guard', 'Manager', 'Robber', 'Customer', 'Loan Officer'] },
  { name: 'Beach', roles: ['Lifeguard', 'Surfer', 'Vendor', 'Tourist', 'Photographer', 'Fisherman'] },
  { name: 'Casino', roles: ['Dealer', 'Pit Boss', 'Gambler', 'Security', 'Bartender', 'High Roller'] },
  { name: 'Circus', roles: ['Ringmaster', 'Clown', 'Acrobat', 'Lion Tamer', 'Ticket Seller', 'Juggler'] },
  { name: 'Hospital', roles: ['Surgeon', 'Nurse', 'Patient', 'Receptionist', 'Paramedic', 'Anesthesiologist'] },
  { name: 'Hotel', roles: ['Concierge', 'Housekeeper', 'Bellhop', 'Manager', 'Guest', 'Chef'] },
  { name: 'Movie Studio', roles: ['Director', 'Actor', 'Camera Operator', 'Stunt Double', 'Producer', 'Makeup Artist'] },
  { name: 'Restaurant', roles: ['Chef', 'Waiter', 'Host', 'Dishwasher', 'Food Critic', 'Sommelier'] },
  { name: 'School', roles: ['Teacher', 'Principal', 'Student', 'Janitor', 'Coach', 'Librarian'] },
  { name: 'Space Station', roles: ['Commander', 'Engineer', 'Scientist', 'Pilot', 'Doctor', 'Communications Officer'] },
  { name: 'Submarine', roles: ['Captain', 'Sonar Operator', 'Engineer', 'Cook', 'Navigator', 'Medic'] },
  { name: 'Supermarket', roles: ['Cashier', 'Stock Clerk', 'Manager', 'Shopper', 'Butcher', 'Security Guard'] },
  { name: 'Cruise Ship', roles: ['Captain', 'Bartender', 'Passenger', 'Entertainer', 'Steward', 'Cruise Director'] },
  { name: 'University', roles: ['Professor', 'Student', 'Dean', 'Janitor', 'Librarian', 'Teaching Assistant'] },
  { name: 'Police Station', roles: ['Detective', 'Officer', 'Chief', 'Suspect', 'Lawyer', 'Dispatcher'] },
  { name: 'Zoo', roles: ['Zookeeper', 'Veterinarian', 'Visitor', 'Tour Guide', 'Gift Shop Clerk', 'Photographer'] },
  { name: 'Art Museum', roles: ['Curator', 'Security Guard', 'Artist', 'Tour Guide', 'Visitor', 'Restorer'] },
  { name: 'Gym', roles: ['Trainer', 'Member', 'Receptionist', 'Nutritionist', 'Manager', 'Yoga Instructor'] },
  { name: 'Wedding', roles: ['Bride', 'Groom', 'Officiant', 'Photographer', 'Guest', 'Caterer'] },
];
