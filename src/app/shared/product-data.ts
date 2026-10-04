export interface Product {
  id: string;
  name: string;
  scientific: string;

  category:
    | 'indoor'
    | 'outdoor'
    | 'accessories';

  subcategory: string;
  price: number;
  image: string;

  description: string;
  benefits: string;

  care: {
    water: string;
    sunlight: string;
    soil: string;
    temperature: string;
    fertilizer: string;
  };

  lifespan: string;
  where: string;
  origin: string;

  details: {
    size: string;
    growth: string;
    type: string;
    difficulty: string;
  };

  propagation: string;
  hybrid: string;
}

export interface CartItem {
  id: string;
  quantity: number;
  name?: string;
  price?: number;
  image?: string;
}


export const CATALOG: Product[] = [
  // --- Indoor: Air-Purifying ---
  { id:'spider-plant', name:'Spider Plant', scientific:'Chlorophytum comosum', category:'indoor', subcategory:'Air-Purifying', price:390,
    image:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR17z7NbudcyfY5izCK8dZvawC8LABizsl3QFrWvY3229X0VhMnZ90TW8Y&s=10?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A graceful, arching plant with narrow green-and-white striped leaves that drape elegantly over the pot. One of the easiest and most rewarding houseplants.',
    benefits:'Removes formaldehyde, xylene, and carbon monoxide from indoor air. Non-toxic and safe around pets.',
    care:{ water:'Water once a week; allow the top inch of soil to dry between waterings.', sunlight:'Bright indirect light; tolerates partial shade.', soil:'Well-draining potting mix with good aeration.', temperature:'18–28°C; avoid cold drafts below 10°C.', fertilizer:'Diluted liquid fertilizer every 4 weeks during spring and summer.' },
    lifespan:'10–15 years with proper care.',
    where:'Indoor',
    origin:'Southern Africa',
    details:{ size:'30–45 cm mature height', growth:'Fast grower', type:'Foliage plant', difficulty:'Beginner — very easy' },
    propagation:'Propagate by dividing the plantlets (spiderettes) that grow on long stems. Place in water or soil.',
    hybrid:'Several cultivars exist including "Variegatum" and "Vittatum"; hybrids are possible within the Chlorophytum genus.' },


  { id:'peace-lily', name:'Peace Lily', scientific:'Spathiphyllum wallisii', category:'indoor', subcategory:'Air-Purifying', price:1690,
    image:'https://www.thesill.com/cdn/shop/files/the-sill_Medium-Peace_Lily_Medium_Isabella_White_Variant.jpg?v=1771608329?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'An elegant evergreen with glossy dark green leaves and distinctive white spathes that bloom throughout the year. A classic indoor favorite.',
    benefits:'Removes ammonia, benzene, formaldehyde, and trichloroethylene from the air. Adds humidity to dry indoor environments.',
    care:{ water:'Keep soil lightly moist; water when the top inch feels dry. Leaves droop when thirsty.', sunlight:'Low to medium indirect light; avoid direct sun.', soil:'Rich, well-draining potting mix with peat moss.', temperature:'18–27°C; minimum 12°C.', fertilizer:'Balanced liquid fertilizer every 6 weeks during growing season.' },
    lifespan:'5–10 years indoors.',
    where:'Indoor',
    origin:'Central and South America (Colombia and Venezuela)',
    details:{ size:'30–60 cm mature height', growth:'Moderate', type:'Flowering foliage plant', difficulty:'Beginner — easy' },
    propagation:'Divide the root ball into smaller clumps during repotting. Each division should have at least 2–3 leaves.',
    hybrid:'Many cultivars available including "Mauna Loa", "Sensation", and "Domino" (variegated); hybrids are possible.' },


  { id:'rubber-plant', name:'Rubber Plant', scientific:'Ficus elastica', category:'indoor', subcategory:'Air-Purifying', price:790,
    image:'https://abeautifulmess.com/wp-content/uploads/2023/06/rubbertree-1.jpg?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A bold, structural plant with large, glossy burgundy-green leaves. Makes a striking statement in any room and grows into a beautiful indoor tree.',
    benefits:'Removes formaldehyde from indoor air. Large leaves help regulate indoor humidity.',
    care:{ water:'Water every 7–10 days; allow the top 2 inches of soil to dry between waterings.', sunlight:'Bright indirect light; tolerates medium light.', soil:'Well-draining potting mix; add perlite for drainage.', temperature:'18–29°C; protect from cold drafts.', fertilizer:'Liquid fertilizer monthly during spring and summer.' },
    lifespan:'15+ years indoors with proper care.',
    where:'Indoor',
    origin:'Southeast Asia (India, Nepal, Myanmar, China)',
    details:{ size:'1–2.5 m mature height indoors', growth:'Fast when young, slows with age', type:'Foliage tree', difficulty:'Beginner — easy' },
    propagation:'Propagate by stem cuttings or air layering. Cuttings root in water or moist soil in 4–6 weeks.',
    hybrid:'Cultivars include "Burgundy", "Tineke" (variegated), "Robusta", and "Melany"; hybrids are possible.' },


  { id:'parlor-palm', name:'Parlor Palm', scientific:'Chamaedorea elegans', category:'indoor', subcategory:'Air-Purifying', price:590,
    image:'https://thegoodplantco.com.au/cdn/shop/products/bamboo-parlor-palm-496453.jpg?v=1645571093?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A compact, feathery palm with soft green fronds that arch gracefully. Victorian-era favorite that remains one of the most popular indoor palms.',
    benefits:'Removes benzene and trichloroethylene from indoor air. Adds a tropical feel and improves humidity.',
    care:{ water:'Water every 7–10 days; allow the top inch to dry between waterings.', sunlight:'Low to medium indirect light; avoid direct sun.', soil:'Well-draining peat-based potting mix.', temperature:'18–27°C; minimum 10°C.', fertilizer:'Slow-release palm fertilizer every 2–3 months during growing season.' },
    lifespan:'10+ years indoors.',
    where:'Indoor',
    origin:'Southern Mexico and Guatemala',
    details:{ size:'1–2 m mature height', growth:'Slow', type:'Palm', difficulty:'Beginner — very easy' },
    propagation:'Propagate by seeds (slow) or by division of clumps during repotting.',
    hybrid:'Limited hybridization; species is naturally variable. Cultivars are rare.' },


  { id:'boston-fern', name:'Boston Fern', scientific:'Nephrolepis exaltata', category:'indoor', subcategory:'Air-Purifying', price:640,
    image:'https://growersguide.ca/assets/images/houseplants/boston-fern-pinterest.webp?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A lush, feathery fern with arching fronds that create a soft, full silhouette. Perfect for bathrooms and humid spaces.',
    benefits:'Removes formaldehyde and xylene from indoor air. Acts as a natural humidifier.',
    care:{ water:'Keep soil consistently moist; do not let it dry out. Water every 3–4 days.', sunlight:'Bright indirect light; no direct sun.', soil:'Rich, peat-based mix with excellent drainage.', temperature:'16–24°C; loves humidity above 50%.', fertilizer:'Diluted liquid fertilizer every 4 weeks during growing season.' },
    lifespan:'5+ years with consistent humidity.',
    where:'Indoor',
    origin:'Tropical regions of the Americas, Africa, and Polynesia',
    details:{ size:'30–90 cm frond length', growth:'Moderate', type:'Fern', difficulty:'Intermediate — needs humidity' },
    propagation:'Propagate by division or by rooting the small plantlets that grow on runners (stolons).',
    hybrid:'Many cultivars including the original "Bostoniensis" sport; further hybrids and sports are possible.' },


  // --- Indoor: Low-Light ---
  { id:'snake-plant', name:'Snake Plant', scientific:'Dracaena trifasciata', category:'indoor', subcategory:'Low-Light', price:520,
    image:'https://cdn.florista.ph/uploads/product/JUN2026/IMG61381-1780734746727.webp?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A hardy, upright succulent with tall, sword-shaped leaves marked with green and yellow bands. Nearly indestructible and perfect for beginners.',
    benefits:'Removes formaldehyde, xylene, toluene, and nitrogen oxides. One of the few plants that produces oxygen at night.',
    care:{ water:'Water every 2–3 weeks; allow soil to dry completely between waterings. Less in winter.', sunlight:'Low to bright indirect light; tolerates direct sun briefly.', soil:'Cactus or succulent mix with excellent drainage.', temperature:'18–30°C; minimum 10°C.', fertilizer:'Cactus fertilizer every 6–8 weeks during growing season.' },
    lifespan:'15–20+ years.',
    where:'Indoor',
    origin:'West Africa (Nigeria to Congo)',
    details:{ size:'30–120 cm mature height', growth:'Slow to moderate', type:'Succulent', difficulty:'Beginner — very easy' },
    propagation:'Propagate by leaf cuttings in soil or water, or by dividing the rhizomes.',
    hybrid:'Many cultivars including "Laurentii" (yellow-edged), "Moonshine", and "Hahnii" (bird\'s nest); hybrids are possible.' },


  { id:'zz-plant', name:'ZZ Plant', scientific:'Zamioculcas zamiifolia', category:'indoor', subcategory:'Low-Light', price:620,
    image:'https://www.qgfloral.com/images/itemVariation/v4_ZZPlantAsShown-23040554723.jpg?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A striking plant with thick, waxy, dark green leaves on graceful arching stems. Drought-tolerant and virtually maintenance-free.',
    benefits:'Removes xylene, toluene, and benzene from indoor air. Stores water in rhizomes, surviving long periods without care.',
    care:{ water:'Water every 2–3 weeks; allow soil to dry completely. Less in winter.', sunlight:'Low to bright indirect light; tolerates very low light.', soil:'Well-draining potting mix; add perlite or sand.', temperature:'18–28°C; minimum 10°C.', fertilizer:'Balanced fertilizer every 2–3 months during growing season.' },
    lifespan:'5–10 years; rhizomes can be divided to extend life.',
    where:'Indoor',
    origin:'Eastern Africa (Kenya to South Africa)',
    details:{ size:'45–90 cm mature height', growth:'Slow', type:'Succulent rhizome plant', difficulty:'Beginner — very easy' },
    propagation:'Propagate by leaflet cuttings, stem cuttings, or division of rhizomes.',
    hybrid:'Cultivars include "Raven" (dark leaves) and "Zenzi" (dwarf); hybrids are possible.' },


  { id:'cast-iron-plant', name:'Cast-iron Plant', scientific:'Aspidistra elatior', category:'indoor', subcategory:'Low-Light', price:680,
    image:'https://cdn.shopify.com/s/files/1/0062/8532/8445/products/Cast_Iron_Plant_6_BB.jpg?v=1633113833?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A tough, reliable plant with broad, dark green arching leaves. Earned its name by surviving neglect, low light, and irregular watering.',
    benefits:'Removes formaldehyde from indoor air. Tolerates neglect better than almost any other houseplant.',
    care:{ water:'Water every 10–14 days; allow soil to dry between waterings.', sunlight:'Low to medium indirect light; avoid direct sun.', soil:'Well-draining potting mix; tolerates poor soils.', temperature:'15–26°C; tolerates cool temperatures.', fertilizer:'Balanced fertilizer every 2 months during growing season.' },
    lifespan:'20+ years; extremely long-lived.',
    where:'Indoor',
    origin:'East Asia (China and Japan)',
    details:{ size:'45–70 cm mature height', growth:'Slow', type:'Foliage plant', difficulty:'Beginner — very easy' },
    propagation:'Propagate by division of the rhizome during repotting. Each section needs at least 2 leaves.',
    hybrid:'Cultivars include "Variegata" (cream-striped) and "Milky Way" (spotted); hybridization is possible.' },


  { id:'pothos-plant', name:'Pothos Plant', scientific:'Epipremnum aureum', category:'indoor', subcategory:'Low-Light', price:490,
    image:'https://theplantsproject.com.au/cdn/shop/files/Golden_Pothos_95901684-f7ec-4068-972c-8282e3f89e7f.png?v=1755572685?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A trailing vine with heart-shaped leaves marbled in green and yellow. One of the most popular and forgiving houseplants in the world.',
    benefits:'Removes formaldehyde, benzene, and carbon monoxide from indoor air. Fast-growing and easy to propagate.',
    care:{ water:'Water every 7–10 days; allow the top 2 inches to dry between waterings.', sunlight:'Low to bright indirect light; tolerates low light.', soil:'Any well-draining potting mix.', temperature:'18–28°C; minimum 12°C.', fertilizer:'Balanced liquid fertilizer every 4–6 weeks during growing season.' },
    lifespan:'5–10 years indoors; longer with good care.',
    where:'Indoor',
    origin:'Mo\'orea, French Polynesia',
    details:{ size:'Trailing vines 1–4 m long', growth:'Fast', type:'Trailing vine', difficulty:'Beginner — very easy' },
    propagation:'Propagate easily by stem cuttings in water or soil. Roots appear in 1–2 weeks.',
    hybrid:'Many cultivars including "Golden", "Marble Queen", "Neon", and "Cebu Blue"; hybrids are possible.' },


  { id:'philodendron', name:'Philodendron', scientific:'Philodendron hederaceum', category:'indoor', subcategory:'Low-Light', price:560,
    image:'https://edsplantshop.com/cdn/shop/articles/elevate-your-space-with-stunning-hanging-indoor-plants-6979660.webp?v=1763522694?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A classic trailing plant with soft, heart-shaped green leaves. Adaptable and elegant, it brings a lush tropical feel to shelves and hanging baskets.',
    benefits:'Removes formaldehyde from indoor air. Fast-growing and easy to maintain.',
    care:{ water:'Water every 7–10 days; allow the top inch to dry between waterings.', sunlight:'Low to bright indirect light; avoid direct sun.', soil:'Well-draining peat-based potting mix.', temperature:'18–27°C; minimum 12°C.', fertilizer:'Balanced liquid fertilizer every 4 weeks during growing season.' },
    lifespan:'10+ years indoors.',
    where:'Indoor',
    origin:'Central and South America (Brazil and the Caribbean)',
    details:{ size:'Trailing vines 1–3 m long', growth:'Fast', type:'Trailing foliage plant', difficulty:'Beginner — easy' },
    propagation:'Propagate by stem cuttings in water or soil. Each cutting should have at least 2 nodes.',
    hybrid:'Many hybrids exist including "Brasil", "Micans", "Lemon Lime", and "Moonlight"; hybridization is common.' },


  // --- Indoor: Large Foliage ---
  { id:'monstera-deliciosa', name:'Monstera Deliciosa', scientific:'Monstera deliciosa', category:'indoor', subcategory:'Large Foliage', price:1250,
    image:'https://cdn.shopify.com/s/files/1/0715/0872/1938/files/63871a909af0d340974905.jpg?v=1748418525?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'An iconic tropical plant with large, split leaves that develop natural holes (fenestrations) as they mature. A dramatic statement piece.',
    benefits:'Removes formaldehyde and purifies indoor air. Adds a bold, architectural element to interiors.',
    care:{ water:'Water every 7–10 days; allow the top 2 inches to dry between waterings.', sunlight:'Bright indirect light; avoid prolonged direct sun.', soil:'Well-draining aroid mix with bark and perlite.', temperature:'20–30°C; minimum 12°C.', fertilizer:'Balanced liquid fertilizer every 4 weeks during growing season.' },
    lifespan:'10–20+ years indoors.',
    where:'Indoor',
    origin:'Tropical forests of Mexico and Panama',
    details:{ size:'1–3 m mature height indoors', growth:'Fast', type:'Climbing aroid', difficulty:'Beginner — easy' },
    propagation:'Propagate by stem cuttings with at least one node and an aerial root. Root in water or sphagnum moss.',
    hybrid:'Cultivars include "Albo Variegata" and "Thai Constellation" (variegated); hybrids are possible within Monstera.' },


  { id:'fiddle-leaf-fig', name:'Fiddle Leaf Fig', scientific:'Ficus lyrata', category:'indoor', subcategory:'Large Foliage', price:1450,
    image:'https://plantsexpress.com/cdn/shop/products/Fiddle-Leaf-Fig-4.jpg?v=1708633742?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A sculptural indoor tree with large, violin-shaped glossy leaves. A design-world favorite for creating instant drama in living spaces.',
    benefits:'Removes formaldehyde from indoor air. Large leaves add a bold visual statement.',
    care:{ water:'Water every 7–10 days; allow the top 2 inches to dry. Consistent watering is key.', sunlight:'Bright indirect light; a few hours of morning sun is ideal.', soil:'Well-draining potting mix with good aeration.', temperature:'18–27°C; avoid drafts and sudden changes.', fertilizer:'Liquid fertilizer monthly during spring and summer.' },
    lifespan:'10–15 years indoors with consistent care.',
    where:'Indoor',
    origin:'Western Africa (Cameroon to Sierra Leone)',
    details:{ size:'1.5–3 m mature height indoors', growth:'Moderate', type:'Foliage tree', difficulty:'Intermediate — needs consistency' },
    propagation:'Propagate by stem cuttings in water or soil, or by air layering.',
    hybrid:'Cultivars include "Bambino" (dwarf) and "Compacta"; hybridization with other Ficus species is possible.' },


  { id:'bird-of-paradise', name:'Bird of Paradise Plant', scientific:'Strelitzia reginae', category:'indoor', subcategory:'Large Foliage', price:1680,
    image:'https://i.etsystatic.com/67073368/r/il/3486a3/8430817643/il_fullxfull.8430817643_ax8c.jpg?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A bold tropical plant with large, paddle-shaped leaves that resemble a banana tree. Can produce striking orange-and-blue flowers indoors.',
    benefits:'Removes formaldehyde from indoor air. Creates a dramatic tropical atmosphere.',
    care:{ water:'Water every 7–10 days; allow the top inch to dry between waterings.', sunlight:'Bright direct to indirect light; needs 4+ hours of sun.', soil:'Rich, well-draining potting mix.', temperature:'20–30°C; minimum 10°C.', fertilizer:'Balanced fertilizer every 4 weeks during growing season.' },
    lifespan:'10–20+ years.',
    where:'Indoor',
    origin:'Southern Africa (South Africa)',
    details:{ size:'1.5–2.5 m mature height indoors', growth:'Moderate to fast', type:'Tropical foliage plant', difficulty:'Intermediate' },
    propagation:'Propagate by division of mature clumps or by seeds (slow, 1–3 months to germinate).',
    hybrid:'Hybrids with Strelitzia nicolai (white bird of paradise) are possible; cultivars include "Mandelas Gold".' },


  { id:'areca-palm', name:'Areca Palm', scientific:'Dypsis lutescens', category:'indoor', subcategory:'Large Foliage', price:1190,
    image:'https://www.plantsforallseasons.co.uk/cdn/shop/files/Areca_Palm_Dypsis_Lutescens_House_Plant_a69a270f-6ec5-4e3e-8fb5-ee6a56283006.webp?v=1760178013?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A feathery, clumping palm with soft, arching fronds in golden-green tones. Adds instant lushness and a tropical feel to any room.',
    benefits:'Removes benzene, formaldehyde, and trichloroethylene. Acts as a natural humidifier.',
    care:{ water:'Water every 7–10 days; keep soil lightly moist but not soggy.', sunlight:'Bright indirect light; tolerates medium light.', soil:'Well-draining peat-based potting mix.', temperature:'18–27°C; minimum 10°C.', fertilizer:'Palm fertilizer every 2–3 months during growing season.' },
    lifespan:'10–15 years indoors.',
    where:'Indoor',
    origin:'Madagascar',
    details:{ size:'1.5–3 m mature height indoors', growth:'Moderate', type:'Palm', difficulty:'Beginner — easy' },
    propagation:'Propagate by seeds (slow) or by division of mature clumps during repotting.',
    hybrid:'Limited hybridization; species is naturally variable.' },


  { id:'dracaena-marginata', name:'Dracaena Marginata', scientific:'Dracaena marginata', category:'indoor', subcategory:'Large Foliage', price:990,
    image:'https://www.plantsolve.com/assets/images/dracaena-marginata.webp?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A slender, upright plant with a tuft of spiky red-edged green leaves atop a woody stem. Grows in interesting twisted forms over time.',
    benefits:'Removes benzene, formaldehyde, and trichloroethylene from indoor air.',
    care:{ water:'Water every 10–14 days; allow soil to dry between waterings.', sunlight:'Bright indirect light; tolerates medium light.', soil:'Well-draining potting mix.', temperature:'18–28°C; minimum 12°C.', fertilizer:'Balanced fertilizer every 6 weeks during growing season.' },
    lifespan:'10–15+ years indoors.',
    where:'Indoor',
    origin:'Madagascar',
    details:{ size:'1–2.5 m mature height indoors', growth:'Slow', type:'Foliage tree', difficulty:'Beginner — easy' },
    propagation:'Propagate by stem cuttings rooted in water or soil. Cuttings root in 3–4 weeks.',
    hybrid:'Cultivars include "Tricolor" (red, green, and cream) and "Colorama"; hybrids are possible within Dracaena.' },


  // --- Outdoor: Ornamental ---
  { id:'hybrid-tea-rose', name:'Hybrid Tea Rose', scientific:'Rosa hybrida', category:'outdoor', subcategory:'Ornamental', price:890,
    image:'https://www.davidaustinroses.co.uk/cdn/shop/files/81da3e1a81b0bec23b7c88f04bbd4a692911650b.webp?v=1758286143&width=800?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A classic garden rose with large, elegant blooms on long straight stems. Available in many colors and prized for cut flowers.',
    benefits:'Produces beautiful, fragrant blooms for months. Attracts pollinators like bees and butterflies.',
    care:{ water:'Water deeply 2–3 times per week; keep soil consistently moist.', sunlight:'Full sun — at least 6 hours of direct sunlight daily.', soil:'Rich, well-draining loamy soil with compost.', temperature:'15–28°C; tolerates light frost.', fertilizer:'Rose fertilizer every 4–6 weeks during growing season.' },
    lifespan:'10–15+ years with proper pruning.',
    where:'Outdoor',
    origin:'Crossbreed of European and Chinese roses (19th century)',
    details:{ size:'90–150 cm mature height', growth:'Moderate', type:'Flowering shrub', difficulty:'Intermediate — needs pruning' },
    propagation:'Propagate by stem cuttings, budding, or grafting onto rootstock.',
    hybrid:'By definition, Hybrid Tea Roses are hybrids — crosses between Tea Roses and Hybrid Perpetuals. Thousands of cultivars exist.' },


  { id:'hibiscus-rosa-sinensis', name:'Hibiscus Rosa-sinensis', scientific:'Hibiscus rosa-sinensis', category:'outdoor', subcategory:'Ornamental', price:680,
    image:'https://costafarms.com/cdn/shop/articles/Costa-Farms-Tricolor-HibisQs-Hibiscus-Bowl_b6edd42f-baf0-4644-b88c-75fb1792fda3_1000x1000.jpg?v=1758827010?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A vibrant evergreen shrub with large, trumpet-shaped flowers in red, pink, yellow, or orange. Blooms continuously in warm climates.',
    benefits:'Produces showy blooms year-round in tropical climates. Attracts hummingbirds and butterflies.',
    care:{ water:'Water 2–3 times per week; keep soil consistently moist.', sunlight:'Full sun to partial shade — at least 4–6 hours of sun.', soil:'Well-draining, slightly acidic soil.', temperature:'16–32°C; protect from frost.', fertilizer:'Balanced fertilizer every 4–6 weeks during growing season.' },
    lifespan:'10–20+ years in warm climates.',
    where:'Outdoor',
    origin:'East Asia (China)',
    details:{ size:'1–3 m mature height', growth:'Fast', type:'Flowering shrub', difficulty:'Beginner — easy' },
    propagation:'Propagate by stem cuttings rooted in soil or water, or by grafting.',
    hybrid:'Extensive hybridization has produced thousands of cultivars in nearly every color; crossbreeding is very common.' },


  { id:'bougainvillea', name:'Bougainvillea', scientific:'Bougainvillea glabra', category:'outdoor', subcategory:'Ornamental', price:480,
    image:'https://www.silvergardensae.com/cdn/shop/files/ChatGPTImageApr3_2026_10_32_09AM.png?v=1775237550&width=1400?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A vigorous climbing vine covered in brilliant papery bracts in magenta, pink, orange, or white. Creates spectacular color for walls and fences.',
    benefits:'Provides months of vivid color. Drought-tolerant once established; attracts pollinators.',
    care:{ water:'Water once a week; allow soil to dry between waterings. Less water = more blooms.', sunlight:'Full sun — at least 6 hours of direct sunlight.', soil:'Well-draining, slightly acidic soil.', temperature:'20–35°C; protect from frost.', fertilizer:'Low-nitrogen fertilizer every 8 weeks during growing season.' },
    lifespan:'20–30+ years.',
    where:'Outdoor',
    origin:'South America (Brazil, Peru, Argentina)',
    details:{ size:'1–10 m trailing/climbing length', growth:'Fast', type:'Flowering vine', difficulty:'Beginner — easy' },
    propagation:'Propagate by stem cuttings rooted in soil. Semi-hardwood cuttings work best.',
    hybrid:'Many hybrids exist including "Barbara Karst", "San Diego Red", and "Raspberry Ice"; crossbreeding is common.' },


  { id:'allamanda-cathartica', name:'Allamanda Cathartica', scientific:'Allamanda cathartica', category:'outdoor', subcategory:'Ornamental', price:620,
    image:'https://i.pinimg.com/1200x/84/c8/d3/84c8d373180022ed84442fe4ec530049.jpg?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A tropical climbing vine with large, golden-yellow trumpet flowers that bloom profusely through warm months. Glossy green leaves add year-round appeal.',
    benefits:'Produces abundant bright flowers. Attracts butterflies and hummingbirds.',
    care:{ water:'Water 2–3 times per week; keep soil consistently moist.', sunlight:'Full sun to partial shade.', soil:'Rich, well-draining soil with organic matter.', temperature:'20–32°C; minimum 10°C.', fertilizer:'Balanced fertilizer every 4–6 weeks during growing season.' },
    lifespan:'5–10+ years.',
    where:'Outdoor',
    origin:'South America (Brazil)',
    details:{ size:'2–5 m climbing length', growth:'Fast', type:'Flowering vine', difficulty:'Beginner — easy' },
    propagation:'Propagate by stem cuttings rooted in soil or by layering.',
    hybrid:'Cultivars include "Cherry Ripe" (reddish flowers) and "Grandiflora"; hybridization is possible.' },


  { id:'ixora-coccinea', name:'Ixora Coccinea', scientific:'Ixora coccinea', category:'outdoor', subcategory:'Ornamental', price:450,
    image:'https://acaciagardencenter.com/cdn/shop/files/ixora-jungle-flame-ixora-chinensis-flowering-shrub-50-60-cm-6738232.png?v=1777666634&width=1200?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A compact evergreen shrub with clusters of small, star-shaped flowers in red, orange, pink, or yellow. Blooms continuously in tropical climates.',
    benefits:'Produces dense, long-lasting flower clusters. Attracts butterflies and birds.',
    care:{ water:'Water 2–3 times per week; keep soil consistently moist.', sunlight:'Full sun to partial shade.', soil:'Slightly acidic, well-draining soil.', temperature:'20–32°C; minimum 10°C.', fertilizer:'Acidic fertilizer every 6 weeks during growing season.' },
    lifespan:'10+ years.',
    where:'Outdoor',
    origin:'Southern India and Sri Lanka',
    details:{ size:'1–2 m mature height', growth:'Moderate', type:'Flowering shrub', difficulty:'Beginner — easy' },
    propagation:'Propagate by stem cuttings rooted in soil, or by air layering.',
    hybrid:'Many cultivars exist including "Nora Grant" and "Super King"; hybrids are possible within Ixora.' },


  // --- Outdoor: Herbs & Edible Plants ---
  { id:'sweet-basil', name:'Sweet Basil', scientific:'Ocimum basilicum', category:'outdoor', subcategory:'Herbs & Edible Plants', price:240,
    image:'https://mckenzieseeds.com/cdn/shop/products/Basil-Sweet-Herb-Mckenzie-Seeds.jpg?v=1654698334?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A fragrant annual herb with soft green leaves and a sweet, peppery aroma. Essential for pesto, salads, and Italian cooking.',
    benefits:'Edible leaves rich in vitamins K and A. Repels flies and mosquitoes; attracts bees.',
    care:{ water:'Water every 2–3 days; keep soil consistently moist.', sunlight:'Full sun — 6–8 hours of direct sunlight.', soil:'Rich, well-draining soil with compost.', temperature:'20–30°C; sensitive to cold.', fertilizer:'Balanced liquid fertilizer every 2 weeks.' },
    lifespan:'Annual — one growing season (4–6 months).',
    where:'Outdoor',
    origin:'Tropical Asia and Africa',
    details:{ size:'30–60 cm mature height', growth:'Fast', type:'Annual herb', difficulty:'Beginner — very easy' },
    propagation:'Propagate by seeds or by stem cuttings in water. Cuttings root in 1–2 weeks.',
    hybrid:'Many cultivars including "Genovese", "Thai", "Lemon", and "Purple Ruffles"; hybrids are common.' },


  { id:'rosemary', name:'Rosemary', scientific:'Salvia rosmarinus', category:'outdoor', subcategory:'Herbs & Edible Plants', price:280,
    image:'https://lancaster.unl.edu/sites/unl.edu.ianr.extension.lancaster/files/2024-12/Rosemary.for_.cooking.jpg?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A woody perennial herb with needle-like leaves and a strong piney aroma. Perfect for roasts, breads, and Mediterranean dishes.',
    benefits:'Edible leaves rich in antioxidants. Repels insects; fragrant and decorative.',
    care:{ water:'Water every 7–10 days; allow soil to dry between waterings. Drought-tolerant.', sunlight:'Full sun — 6+ hours of direct sunlight.', soil:'Well-draining sandy or gravelly soil.', temperature:'15–28°C; tolerates light frost.', fertilizer:'Light feeding every 2 months; avoid over-fertilizing.' },
    lifespan:'15–20+ years as a perennial.',
    where:'Outdoor',
    origin:'Mediterranean region',
    details:{ size:'60–120 cm mature height', growth:'Moderate', type:'Perennial herb', difficulty:'Beginner — easy' },
    propagation:'Propagate by stem cuttings rooted in water or soil. Cuttings root in 2–3 weeks.',
    hybrid:'Cultivars include "Prostratus" (trailing), "Tuscan Blue", and "Arp"; hybrids are possible.' },


  { id:'cherry-tomato', name:'Cherry Tomato', scientific:'Solanum lycopersicum var. cerasiforme', category:'outdoor', subcategory:'Herbs & Edible Plants', price:320,
    image:'https://images.pexels.com/photos/14920999/pexels-photo-14920999.jpeg?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A fast-growing vine producing clusters of small, sweet tomatoes in red, yellow, or orange. Perfect for containers and small gardens.',
    benefits:'Edible fruit rich in lycopene, vitamin C, and potassium. Fast and rewarding to grow.',
    care:{ water:'Water every 2–3 days; keep soil consistently moist.', sunlight:'Full sun — 6–8 hours of direct sunlight.', soil:'Rich, well-draining soil with compost.', temperature:'20–30°C; sensitive to cold.', fertilizer:'Tomato fertilizer every 2 weeks once flowering begins.' },
    lifespan:'Annual — one growing season (5–7 months).',
    where:'Outdoor',
    origin:'South America (Ecuador and Peru)',
    details:{ size:'1–2 m vine length', growth:'Fast', type:'Annual fruiting vine', difficulty:'Beginner — easy' },
    propagation:'Propagate by seeds or by stem cuttings rooted in soil. Seeds germinate in 5–10 days.',
    hybrid:'Many hybrids exist including "Sweet 100", "Sungold", and "Chocolate Cherry"; hybridization is very common.' },


  { id:'cilantro', name:'Cilantro', scientific:'Coriandrum sativum', category:'outdoor', subcategory:'Herbs & Edible Plants', price:180,
    image:'https://www.tasteofhome.com/wp-content/uploads/2023/07/GettyImages-610970154.jpg?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A fast-growing annual herb with flat, lacy green leaves and a bright citrusy flavor. Both leaves (cilantro) and seeds (coriander) are edible.',
    benefits:'Edible leaves rich in vitamins A, C, and K. Attracts beneficial insects.',
    care:{ water:'Water every 2–3 days; keep soil consistently moist.', sunlight:'Full sun to partial shade; prefers cooler weather.', soil:'Well-draining, light soil with compost.', temperature:'15–25°C; bolts in hot weather.', fertilizer:'Balanced liquid fertilizer every 3 weeks.' },
    lifespan:'Annual — 2–3 months before bolting.',
    where:'Outdoor',
    origin:'Southern Europe and the Middle East',
    details:{ size:'30–50 cm mature height', growth:'Fast', type:'Annual herb', difficulty:'Beginner — very easy' },
    propagation:'Propagate by seeds sown directly in soil. Germinates in 7–10 days.',
    hybrid:'Limited hybridization; varieties include "Slow Bolt" and "Calypso" bred for delayed bolting.' },


  { id:'oregano', name:'Oregano', scientific:'Origanum vulgare', category:'outdoor', subcategory:'Herbs & Edible Plants', price:220,
    image:'https://down-ph.img.susercontent.com/file/df6cd8ba8517dabfc92282cd7a57250a?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A woody perennial herb with small, aromatic leaves and a warm, spicy flavor. Essential for Italian, Greek, and Mexican cooking.',
    benefits:'Edible leaves rich in antioxidants and antibacterial compounds. Attracts bees and butterflies.',
    care:{ water:'Water every 7–10 days; allow soil to dry between waterings.', sunlight:'Full sun — 6+ hours of direct sunlight.', soil:'Well-draining, moderately fertile soil.', temperature:'15–28°C; tolerates cold.', fertilizer:'Light feeding every 2 months; avoid over-fertilizing.' },
    lifespan:'5–10+ years as a perennial.',
    where:'Outdoor',
    origin:'Mediterranean region',
    details:{ size:'30–60 cm mature height', growth:'Moderate', type:'Perennial herb', difficulty:'Beginner — easy' },
    propagation:'Propagate by stem cuttings, division, or seeds. Cuttings root in 2–3 weeks.',
    hybrid:'Cultivars include "Greek", "Italian", and "Golden" (variegated); hybrids are possible.' },


  // --- Outdoor: Garden Shrubs & Small Trees ---
  { id:'frangipani-tree', name:'Frangipani Tree', scientific:'Plumeria rubra', category:'outdoor', subcategory:'Garden Shrubs & Small Trees', price:1150,
    image:'https://greensouq.ae/cdn/shop/files/plumeria-obtusa-frangipani-25-3-meters-outdoor-plant-2717367.webp?v=1757684028&width=800?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A small tropical tree with thick branches and clusters of fragrant, waxy flowers in white, pink, yellow, or red. Iconic in tropical gardens.',
    benefits:'Produces intensely fragrant flowers used in leis and perfumes. Drought-tolerant once established.',
    care:{ water:'Water once a week; allow soil to dry between waterings. Reduce in winter.', sunlight:'Full sun — at least 6 hours of direct sunlight.', soil:'Well-draining, sandy or loamy soil.', temperature:'20–35°C; protect from frost.', fertilizer:'High-phosphorus fertilizer every 4–6 weeks during growing season.' },
    lifespan:'20–40+ years.',
    where:'Outdoor',
    origin:'Central America (Mexico to Panama)',
    details:{ size:'2–8 m mature height', growth:'Moderate', type:'Flowering small tree', difficulty:'Beginner — easy' },
    propagation:'Propagate by stem cuttings; allow the cut end to dry for 3–5 days before planting in soil.',
    hybrid:'Many hybrids exist including "Singapore" (P. obtusa) and various color crosses; hybridization is common.' },


  { id:'gardenia-jasminoides', name:'Gardenia Jasminoides', scientific:'Gardenia jasminoides', category:'outdoor', subcategory:'Garden Shrubs & Small Trees', price:690,
    image:'https://apps.rhs.org.uk/plantselectorimages/detail/elbo13311.jpg?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'An evergreen shrub with glossy dark leaves and creamy white, intensely fragrant flowers. Blooms from spring through summer.',
    benefits:'Produces beautiful, fragrant flowers for cutting. Attracts butterflies and birds.',
    care:{ water:'Water 2–3 times per week; keep soil consistently moist but not soggy.', sunlight:'Full sun to partial shade; prefers morning sun.', soil:'Acidic, well-draining soil with peat moss.', temperature:'18–28°C; minimum 5°C.', fertilizer:'Acidic fertilizer every 4–6 weeks during growing season.' },
    lifespan:'10–15+ years.',
    where:'Outdoor',
    origin:'China, Japan, and Taiwan',
    details:{ size:'60–180 cm mature height', growth:'Moderate', type:'Flowering evergreen shrub', difficulty:'Intermediate — needs acidic soil' },
    propagation:'Propagate by stem cuttings rooted in soil, or by grafting.',
    hybrid:'Many cultivars including "August Beauty", "Radicans" (dwarf), and "Mystery"; hybrids are common.' },


  { id:'calamansi-tree', name:'Calamansi Tree', scientific:'Citrus microcarpa', category:'outdoor', subcategory:'Garden Shrubs & Small Trees', price:980,
    image:'https://substackcdn.com/image/fetch/$s_!5f42!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F7572c410-4546-4d88-94e7-d68fee4fc94d_1367x2048.jpeg?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A small citrus tree producing round, green-to-orange acidic fruit used widely in Filipino and Southeast Asian cooking. Glossy leaves and fragrant white flowers.',
    benefits:'Edible fruit rich in vitamin C. Fragrant flowers; compact size suits small gardens.',
    care:{ water:'Water 2–3 times per week; keep soil consistently moist.', sunlight:'Full sun — 6+ hours of direct sunlight.', soil:'Well-draining, slightly acidic soil.', temperature:'20–32°C; protect from frost.', fertilizer:'Citrus fertilizer every 6–8 weeks during growing season.' },
    lifespan:'15–25+ years.',
    where:'Outdoor',
    origin:'Philippines and Southeast Asia',
    details:{ size:'2–5 m mature height', growth:'Moderate', type:'Fruiting citrus tree', difficulty:'Beginner — easy' },
    propagation:'Propagate by seeds, budding, or grafting onto citrus rootstock.',
    hybrid:'A natural hybrid of Citrus reticulata and Citrus japonica; further hybridization with citrus is possible.' },


  { id:'boxwood', name:'Boxwood', scientific:'Buxus sempervirens', category:'outdoor', subcategory:'Garden Shrubs & Small Trees', price:560,
    image:'https://deborahsilver.com/wp-content/uploads/2020/05/topiary-plants-8-scaled.jpg?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A dense evergreen shrub with small, rounded leaves. Perfect for hedges, topiary, and formal garden borders.',
    benefits:'Provides year-round structure and greenery. Ideal for shaping and formal hedging.',
    care:{ water:'Water once a week; established plants are drought-tolerant.', sunlight:'Full sun to partial shade.', soil:'Well-draining, slightly alkaline soil.', temperature:'5–28°C; very cold-hardy.', fertilizer:'Slow-release shrub fertilizer once in spring.' },
    lifespan:'20–40+ years.',
    where:'Outdoor',
    origin:'Western and Southern Europe, North Africa',
    details:{ size:'60–200 cm mature height', growth:'Slow', type:'Evergreen shrub', difficulty:'Beginner — easy' },
    propagation:'Propagate by stem cuttings rooted in soil. Cuttings root in 6–8 weeks.',
    hybrid:'Cultivars include "Suffruticosa" (dwarf) and "Elegantissima" (variegated); hybrids are possible.' },


  { id:'butterfly-bush', name:'Butterfly Bush', scientific:'Buddleja davidii', category:'outdoor', subcategory:'Garden Shrubs & Small Trees', price:740,
    image:'https://i.pinimg.com/736x/06/ce/65/06ce65cfa736039d9cf3062151d4b8e5.jpg?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A fast-growing shrub with long, arching spikes of small fragrant flowers in purple, pink, white, or orange. Irresistible to butterflies.',
    benefits:'Attracts butterflies, bees, and hummingbirds in large numbers. Fast-growing and colorful.',
    care:{ water:'Water once a week; drought-tolerant once established.', sunlight:'Full sun — 6+ hours of direct sunlight.', soil:'Well-draining, average soil.', temperature:'15–30°C; dies back in winter and regrows.', fertilizer:'Balanced fertilizer once in early spring.' },
    lifespan:'5–10+ years.',
    where:'Outdoor',
    origin:'Central China',
    details:{ size:'1–2.5 m mature height', growth:'Fast', type:'Flowering deciduous shrub', difficulty:'Beginner — easy' },
    propagation:'Propagate by stem cuttings in spring or summer. Cuttings root in 3–4 weeks.',
    hybrid:'Many cultivars including "Black Knight", "Nanho Blue", and "Pink Delight"; hybrids are common.' },


  // --- Accessories: Care & Maintenance ---
  { id:'watering-can', name:'Watering Can', scientific:'Garden watering tool', category:'accessories', subcategory:'Care & Maintenance', price:680,
    image:'https://images.pexels.com/photos/29005354/pexels-photo-29005354.jpeg?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A long-spout watering can designed for precise, gentle watering of indoor and outdoor plants. Balanced for easy handling.',
    benefits:'Provides controlled, splash-free watering. The narrow spout reaches deep into foliage without spilling.',
    care:{ water:'Wipe clean and store dry after use.', sunlight:'Keep away from prolonged direct rain to prevent rust.', soil:'Use with a loose, well-draining potting mix.', temperature:'Store at normal indoor temperatures.', fertilizer:'No fertilizer needed.' },
    lifespan:'Designed for long-term everyday use.',
    where:'Indoor or outdoor garden use',
    origin:'Designed for modern plant homes',
    details:{ size:'1.5 L capacity, 35 cm length', growth:'Reusable and durable', type:'Plant care accessory', difficulty:'Beginner-friendly' },
    propagation:'Not applicable; replace parts only when worn.',
    hybrid:'Not applicable.' },


  { id:'organic-soil-fertilizer', name:'Organic Soil Fertilizer', scientific:'Natural soil amendment', category:'accessories', subcategory:'Care & Maintenance', price:280,
    image:'https://www.wellcoindustries.com/wp-content/uploads/2026/01/burlap-sack-gardening.png?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A balanced organic fertilizer blend enriched with compost, bone meal, and natural minerals. Feeds plants slowly and improves soil structure.',
    benefits:'Promotes healthy root growth, lush foliage, and vibrant blooms. Safe for edibles and indoor plants.',
    care:{ water:'Mix into soil; water after application to activate.', sunlight:'Store in a cool, dry place away from direct sun.', soil:'Blend with existing potting mix or top-dress.', temperature:'Store at room temperature.', fertilizer:'This is a fertilizer — apply every 4–6 weeks.' },
    lifespan:'Shelf life of 2–3 years when stored properly.',
    where:'Indoor or outdoor garden use',
    origin:'Formulated from natural organic ingredients',
    details:{ size:'1 kg pouch', growth:'Improves soil over time', type:'Plant care accessory', difficulty:'Beginner-friendly' },
    propagation:'Not applicable.',
    hybrid:'Not applicable.' },


  { id:'garden-trowel', name:'Garden Trowel', scientific:'Stainless steel hand trowel', category:'accessories', subcategory:'Care & Maintenance', price:390,
    image:'https://images.pexels.com/photos/7655612/pexels-photo-7655612.jpeg?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A sturdy hand trowel with a rust-resistant stainless steel blade and ergonomic wooden handle. Perfect for planting, transplanting, and potting.',
    benefits:'Makes digging, scooping, and transplanting quick and precise. Ergonomic handle reduces hand strain.',
    care:{ water:'Wipe clean after use; store dry.', sunlight:'Keep away from prolonged direct rain to prevent rust.', soil:'Clean soil off the blade after each use.', temperature:'Store at normal indoor temperatures.', fertilizer:'No fertilizer needed.' },
    lifespan:'Designed for long-term everyday use.',
    where:'Indoor or outdoor garden use',
    origin:'Designed for modern plant homes',
    details:{ size:'25 cm length, 7 cm blade width', growth:'Reusable and durable', type:'Plant care accessory', difficulty:'Beginner-friendly' },
    propagation:'Not applicable.',
    hybrid:'Not applicable.' },


  { id:'pruning-shears', name:'Pruning Shears', scientific:'Precision garden pruners', category:'accessories', subcategory:'Care & Maintenance', price:340,
    image:'https://image.made-in-china.com/2f0j00ieRVtpWMCqbd/Mf-010-Garden-Pruning-Shears-Tree-Trimmer-Hand-Pruner-Branch-Hedge-Shrub-Bush-Clippers-Sharp-Bypass-Secateurs-Fruit-Picking-Scissor.webp?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'Sharp, bypass-blade pruning shears for clean cuts on stems, branches, and dead foliage. Spring-loaded for comfortable repeated use.',
    benefits:'Encourages healthy plant growth by removing dead or diseased branches. Clean cuts prevent infection.',
    care:{ water:'Wipe blades clean after use; store dry.', sunlight:'Keep away from prolonged direct rain to prevent rust.', soil:'Clean sap and residue off blades after each use.', temperature:'Store at normal indoor temperatures.', fertilizer:'No fertilizer needed.' },
    lifespan:'Designed for long-term everyday use.',
    where:'Indoor or outdoor garden use',
    origin:'Designed for modern plant homes',
    details:{ size:'20 cm length, 5 cm blade', growth:'Reusable and durable', type:'Plant care accessory', difficulty:'Beginner-friendly' },
    propagation:'Not applicable.',
    hybrid:'Not applicable.' },


  { id:'neem-oil', name:'Neem Oil', scientific:'Azadirachta indica extract', category:'accessories', subcategory:'Care & Maintenance', price:360,
    image:'https://www.plantsforallseasons.co.uk/cdn/shop/articles/guide-to-using-neem-oil-on-houseplants-725964_1066x.jpg?v=1681945190?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A natural, organic pesticide and fungicide pressed from neem tree seeds. Controls common pests like aphids, mites, and whiteflies without harsh chemicals.',
    benefits:'Safe, organic pest control for indoor and outdoor plants. Also prevents fungal diseases like powdery mildew.',
    care:{ water:'Mix with water and spray on leaves; reapply weekly.', sunlight:'Apply in early morning or evening; avoid direct sun after spraying.', soil:'Can be used as a soil drench for root pests.', temperature:'Store at room temperature.', fertilizer:'Not a fertilizer.' },
    lifespan:'Shelf life of 1–2 years when stored properly.',
    where:'Indoor or outdoor garden use',
    origin:'India (Azadirachta indica tree)',
    details:{ size:'250 ml bottle', growth:'Reusable and durable', type:'Plant care accessory', difficulty:'Beginner-friendly' },
    propagation:'Not applicable.',
    hybrid:'Not applicable.' },


  // --- Accessories: Structural Support ---
  { id:'moss-pole', name:'Moss Pole', scientific:'Coco coir climbing support', category:'accessories', subcategory:'Structural Support', price:290,
    image:'https://www.queenofgreenhq.com/cdn/shop/files/04ACED38-0743-45AE-94B4-0AAAD99DA355.jpg?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A moisture-retaining coco coir pole that supports climbing plants like Monstera, Pothos, and Philodendron. Encourages larger leaf growth.',
    benefits:'Supports climbing vines, encouraging larger leaves and natural growth. Retains moisture for aerial roots.',
    care:{ water:'Mist the pole regularly to keep it moist for aerial roots.', sunlight:'Keep away from prolonged direct rain.', soil:'Insert directly into the potting mix.', temperature:'Store at normal indoor temperatures.', fertilizer:'No fertilizer needed.' },
    lifespan:'Designed for long-term everyday use.',
    where:'Indoor or outdoor garden use',
    origin:'Designed for modern plant homes',
    details:{ size:'45 cm height, 4 cm diameter', growth:'Reusable and durable', type:'Plant care accessory', difficulty:'Beginner-friendly' },
    propagation:'Not applicable.',
    hybrid:'Not applicable.' },


  { id:'wire-cage', name:'Wire Cage', scientific:'Powder-coated plant support', category:'accessories', subcategory:'Structural Support', price:420,
    image:'https://i.pinimg.com/736x/fc/28/9c/fc289cef0f1ac2af9bda34dc49d08142.jpg?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A sturdy, powder-coated wire cage that supports top-heavy plants and tomatoes. Prevents stems from bending or breaking under fruit weight.',
    benefits:'Prevents stem damage and keeps plants upright. Improves airflow and sun exposure around the plant.',
    care:{ water:'Wipe clean and store dry after use.', sunlight:'Keep away from prolonged direct rain.', soil:'Insert directly into the potting mix.', temperature:'Store at normal indoor temperatures.', fertilizer:'No fertilizer needed.' },
    lifespan:'Designed for long-term everyday use.',
    where:'Indoor or outdoor garden use',
    origin:'Designed for modern plant homes',
    details:{ size:'40 cm height, 20 cm diameter', growth:'Reusable and durable', type:'Plant care accessory', difficulty:'Beginner-friendly' },
    propagation:'Not applicable.',
    hybrid:'Not applicable.' },


  { id:'bamboo-stakes', name:'Bamboo Stakes', scientific:'Natural bamboo supports', category:'accessories', subcategory:'Structural Support', price:190,
    image:'https://www.wellcowholesale.com/media/blog/bamboo-stakes-for-pepper-plants.png?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'Natural bamboo stakes in assorted sizes for supporting tall stems, seedlings, and climbing plants. Biodegradable and eco-friendly.',
    benefits:'Provides sturdy, natural support for growing plants. Biodegradable and environmentally friendly.',
    care:{ water:'Wipe clean and store dry after use.', sunlight:'Keep away from prolonged direct rain.', soil:'Insert directly into the potting mix.', temperature:'Store at normal indoor temperatures.', fertilizer:'No fertilizer needed.' },
    lifespan:'Designed for long-term everyday use.',
    where:'Indoor or outdoor garden use',
    origin:'Natural bamboo from Asia',
    details:{ size:'30 cm, 45 cm, and 60 cm stakes (set of 6)', growth:'Reusable and durable', type:'Plant care accessory', difficulty:'Beginner-friendly' },
    propagation:'Not applicable.',
    hybrid:'Not applicable.' },


  { id:'plant-clips-ties', name:'Plant Clips & Ties', scientific:'Soft silicone plant ties', category:'accessories', subcategory:'Structural Support', price:160,
    image:'https://img.lazcdn.com/g/p/87ffbbc9c2ba27d602d3d29efa03212a.jpg_960x960q80.jpg_.webp?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'Soft, reusable silicone clips and ties for gently securing vines and stems to stakes, trellises, and moss poles without damaging the plant.',
    benefits:'Secures plants gently without cutting into stems. Reusable and adjustable as the plant grows.',
    care:{ water:'Wipe clean and store dry after use.', sunlight:'Keep away from prolonged direct rain.', soil:'Not applicable.', temperature:'Store at normal indoor temperatures.', fertilizer:'No fertilizer needed.' },
    lifespan:'Designed for long-term everyday use.',
    where:'Indoor or outdoor garden use',
    origin:'Designed for modern plant homes',
    details:{ size:'Set of 20 clips, 3 cm each', growth:'Reusable and durable', type:'Plant care accessory', difficulty:'Beginner-friendly' },
    propagation:'Not applicable.',
    hybrid:'Not applicable.' },


  { id:'mini-wooden-trellis', name:'Mini Wooden Plant Trellis', scientific:'Pinewood climbing frame', category:'accessories', subcategory:'Structural Support', price:450,
    image:'https://images.pexels.com/photos/20551647/pexels-photo-20551647.jpeg?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A compact pinewood trellis frame for supporting climbing plants in pots. Adds decorative structure and encourages vertical growth.',
    benefits:'Supports climbing vines and adds vertical interest. Natural wood blends with plant decor.',
    care:{ water:'Wipe clean and store dry after use.', sunlight:'Keep away from prolonged direct rain.', soil:'Insert directly into the potting mix.', temperature:'Store at normal indoor temperatures.', fertilizer:'No fertilizer needed.' },
    lifespan:'Designed for long-term everyday use.',
    where:'Indoor or outdoor garden use',
    origin:'Designed for modern plant homes',
    details:{ size:'40 cm x 25 cm frame', growth:'Reusable and durable', type:'Plant care accessory', difficulty:'Beginner-friendly' },
    propagation:'Not applicable.',
    hybrid:'Not applicable.' },


  // --- Accessories: Display & Decor ---
  { id:'pots', name:'Pots', scientific:'Hand-finished ceramic planter', category:'accessories', subcategory:'Display & Decor', price:580,
    image:'https://hips.hearstapps.com/hmg-prod/images/7d0e7365-c8ae-49ad-90d5-f3e43cb879a3.jpeg?crop=0.670xw:1.00xh;0.166xw,0&resize=640:*?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'Hand-finished ceramic planters available in multiple sizes and earthy glazes. Each pot has a drainage hole and matching saucer.',
    benefits:'Provides a stable, beautiful home for plants. Glazed finish resists water damage and staining.',
    care:{ water:'Wipe exterior clean; ensure drainage hole remains unblocked.', sunlight:'Keep away from prolonged direct rain.', soil:'Fill with well-draining potting mix.', temperature:'Frost-resistant; store indoors in freezing weather.', fertilizer:'No fertilizer needed.' },
    lifespan:'Designed for long-term everyday use.',
    where:'Indoor or outdoor garden use',
    origin:'Designed for modern plant homes',
    details:{ size:'Small (10 cm), Medium (15 cm), Large (20 cm)', growth:'Reusable and durable', type:'Plant care accessory', difficulty:'Beginner-friendly' },
    propagation:'Not applicable.',
    hybrid:'Not applicable.' },


  { id:'metal-plant-stand', name:'Metal Plant Stand', scientific:'Powder-coated steel stand', category:'accessories', subcategory:'Display & Decor', price:1250,
    image:'https://m.media-amazon.com/images/I/81RxFBNh2KL.jpg?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A tiered, powder-coated steel stand that elevates plants to create a layered indoor garden display. Holds 3–5 pots depending on size.',
    benefits:'Elevates plants for better light exposure and visual display. Sturdy and rust-resistant.',
    care:{ water:'Wipe clean and store dry after use.', sunlight:'Keep away from prolonged direct rain.', soil:'Not applicable.', temperature:'Store at normal indoor temperatures.', fertilizer:'No fertilizer needed.' },
    lifespan:'Designed for long-term everyday use.',
    where:'Indoor or outdoor garden use',
    origin:'Designed for modern plant homes',
    details:{ size:'80 cm height, 40 cm width, 3 tiers', growth:'Reusable and durable', type:'Plant care accessory', difficulty:'Beginner-friendly' },
    propagation:'Not applicable.',
    hybrid:'Not applicable.' },


  { id:'plant-saucer', name:'Plant Saucer', scientific:'Glazed ceramic drip tray', category:'accessories', subcategory:'Display & Decor', price:220,
    image:'https://fountainful.com/cdn/shop/files/Square1_69b872bb-8c87-4e69-978f-e76692202777.jpg?v=1715612622?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A shallow, glazed ceramic saucer that sits beneath pots to catch excess water and protect surfaces. Available in multiple sizes.',
    benefits:'Prevents water damage to furniture and floors. Matches ceramic pot glazes for a cohesive look.',
    care:{ water:'Empty standing water regularly to prevent root rot.', sunlight:'Keep away from prolonged direct rain.', soil:'Not applicable.', temperature:'Store at normal indoor temperatures.', fertilizer:'No fertilizer needed.' },
    lifespan:'Designed for long-term everyday use.',
    where:'Indoor or outdoor garden use',
    origin:'Designed for modern plant homes',
    details:{ size:'Small (12 cm), Medium (18 cm), Large (24 cm)', growth:'Reusable and durable', type:'Plant care accessory', difficulty:'Beginner-friendly' },
    propagation:'Not applicable.',
    hybrid:'Not applicable.' },


  { id:'hanging-plant-holders', name:'Hanging Plant Holders', scientific:'Woven cotton hanger', category:'accessories', subcategory:'Display & Decor', price:480,
    image:'https://images.pexels.com/photos/12583992/pexels-photo-12583992.jpeg?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'Hand-woven cotton macrame plant hangers that suspend pots at varying heights. Creates a layered, bohemian indoor garden display.',
    benefits:'Saves surface space by using vertical space. Adds texture and warmth to any room.',
    care:{ water:'Spot clean with damp cloth; air dry.', sunlight:'Keep away from prolonged direct rain.', soil:'Not applicable.', temperature:'Store at normal indoor temperatures.', fertilizer:'No fertilizer needed.' },
    lifespan:'Designed for long-term everyday use.',
    where:'Indoor or outdoor garden use',
    origin:'Designed for modern plant homes',
    details:{ size:'90 cm length, holds 10–20 cm pots', growth:'Reusable and durable', type:'Plant care accessory', difficulty:'Beginner-friendly' },
    propagation:'Not applicable.',
    hybrid:'Not applicable.' },


  { id:'wooden-plant-shelf', name:'Wooden Plant Shelf', scientific:'Solid acacia display shelf', category:'accessories', subcategory:'Display & Decor', price:1890,
    image:'https://neodirect.com/cdn/shop/files/LS-2_ef6a3cf3-a935-4fbb-a753-0cdb66b276bf.jpg?v=1754649077?auto=compress&cs=tinysrgb&h=700&w=700',
    description:'A solid acacia wood shelf with multiple tiers for displaying a collection of plants. Natural grain and warm tones complement any interior.',
    benefits:'Creates a dedicated plant display area. Sturdy construction holds multiple pots of varying sizes.',
    care:{ water:'Wipe with a dry cloth; avoid water exposure.', sunlight:'Keep away from prolonged direct rain.', soil:'Not applicable.', temperature:'Store at normal indoor temperatures.', fertilizer:'No fertilizer needed.' },
    lifespan:'Designed for long-term everyday use.',
    where:'Indoor or outdoor garden use',
    origin:'Designed for modern plant homes',
    details:{ size:'120 cm height, 60 cm width, 4 tiers', growth:'Reusable and durable', type:'Plant care accessory', difficulty:'Beginner-friendly' },
    propagation:'Not applicable.',
    hybrid:'Not applicable.' }

];
