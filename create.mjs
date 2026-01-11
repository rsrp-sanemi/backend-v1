import fs from 'fs';


const generateCities = () => {
  const cities = [];
  const cityNames = ["Springfield", "Riverside", "Georgetown", "Franklin", "Clinton", "Madison", "Salem", "Chester"];

  for (let i = 1; i <= 100; i++) {
    // Map to stateIds 1 through 100
    const stateId = i; 
    const population = Math.floor(Math.random() * (5000000 - 50000) + 50000);

    cities.push({
      id: i,
      name: `${cityNames[i % 8]} City ${i}`,
      stateId: stateId,
      population: population
    });
  }
  return cities;
};

const data = generateCities();
fs.writeFileSync('cities.json', JSON.stringify(data, null, 2));
console.log('✅ cities.json created (100 entries)');