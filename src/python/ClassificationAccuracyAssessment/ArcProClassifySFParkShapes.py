def classify(functional):
    
    ones = ['Archery Range', 'Bowling Green', 'Baseball', 'Softball', 'Soccer', 'Multi-Use Turf']
    twos = ['Water Body']
    threes = ['Basketball Court', 'Bleachers', 'Tennis Court', 'Structural', 'Skatepark', 'Pickleball Court', 'Parking',
              'Interior - Storage', 'Interior - Administrative', 'Childrens Play Area', 'Interior - Custodial'
              'Interior - Mechanical', 'Interior - Recreational', 'Interior - Restroom', 'Interior - Storage'
              'Interior - Trade', 'Track']
    
    if (functional in ones):
        return 1
    elif(functional in twos):
        return 2
    elif(functional in threes): 
        return 3
    else:
        return 0