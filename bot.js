const mysql = require('mysql');
const { Client, Intents, MessageEmbed , MessageButton, MessageActionRow} = require('discord.js');
const config = require('./config.json');
const { token, mysql: mysqlConfig } = config; 

const client = new Client({ 
  intents: [
    Intents.FLAGS.GUILDS, 
    Intents.FLAGS.GUILD_MESSAGES
  ] 
});

let connection;

client.on('ready', () => {
  console.log(`به عنوان ${client.user.tag} وارد شده‌ام.`);
});

client.on('message', async message => {
  if (message.author.bot) return;

  if (message.content.startsWith('.')) {
    if (!message.member.permissions.has("ADMINISTRATOR")) {
      message.channel.send("You do not have permission to use commands.");
      return;
    }
  }

  if (message.content.startsWith('.setup')) {
    await handleSetupCommand(message);
  } else if (message.content.startsWith('.add')) {
    await handleAddProductCommand(message);
  } else if (message.content.startsWith('.removeproduct')) {
    await handleRemoveProductCommand(message);
  } else if (message.content === '.productlist') {
    await handleProductListCommand(message);
  } else if (message.content === '.restore') {
    await handleRestoreCommand(message);
  } else if (message.content.startsWith('.inventory')) {
    const userId = message.content.split(' ')[1];
    if (!userId) {
      message.channel.send('Usage: .inventory <user_id>');
      return;
    }
    try {
      await handleInventoryCommand(message, userId);
    } catch (error) {
      console.error('Error handling inventory command:', error);
      message.channel.send('Error handling inventory command. Please try again later.');
    }
  } else if (message.content.startsWith('.clear inventory')) {
    const userId = message.content.split(' ')[2]; 
    if (!userId) {
      message.channel.send('Usage: .clear inventory <user_id>');
      return;
    }
    try {
      await clearUserInventory(userId);
      message.channel.send('User inventory cleared successfully.');
    } catch (error) {
      console.error('Error clearing user inventory:', error);
      message.channel.send('Error clearing user inventory. Please try again later.');
    }
  }
});



async function clearUserInventory(userId) {
  const sql = 'DELETE FROM user_inventory WHERE user_id = ?';
  await executeQuery(sql, [userId]);
}
async function handleSetupCommand(message) {
  const rules = ['فروشنده', 'مشتری']; 
  try {
    await setupServer(message.guild, rules);
    message.channel.send('راه‌اندازی سرور با موفقیت انجام شد.');
    const createProductsTableQuery = `
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        description TEXT,
        image_link VARCHAR(255)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    await executeQuery(createProductsTableQuery);
    //farsi = 'ALTER TABLE products CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;  '
    //await executeQuery(farsi)
    // Create user_inventory table if it doesn't exist
    const createUserInventoryTableQuery = `
    CREATE TABLE IF NOT EXISTS user_inventory (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      product_name VARCHAR(255) NOT NULL,
      FOREIGN KEY (product_name) REFERENCES products(name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    
    `;
    await executeQuery(createUserInventoryTableQuery);
  } catch (error) {
    console.error('خطا در تنظیم سرور:', error);
    message.channel.send('خطا در تنظیم سرور. لطفاً بعداً دوباره امتحان کنید.');
    
  }
  
}

async function handleAddProductCommand(message) {
  const args = message.content.slice(5).split(/\s+/);
  const productName = args[0];
  const price = parseFloat(args[1].replace(/\D/g, ''));
  const description = args.slice(2, -1).join(' ');
  const imageLink = args[args.length - 1];

  if (!productName || isNaN(price) || !description || !imageLink) {
      message.channel.send('Usage: .add <product name> <price> <description> <image link>');
      return;
  }

  const productChannel = await createProductChannel(message.guild, productName);
  const embed = new MessageEmbed()
      .setTitle(productName)
      .setDescription(description)
      .addField('Price', `${price.toFixed(2)}`)
      .setImage(imageLink)
      .setColor('#0099ff');

  const addButton = new MessageButton()
      .setCustomId('add_to_inventory')
      .setLabel('اضافه کردن به سبد خرید')
      .setStyle('SUCCESS');

  const row = new MessageActionRow().addComponents(addButton);

  await productChannel.send({ embeds: [embed], components: [row] });

  try {
      await saveProductToDB(productName, price, description, imageLink);
      message.channel.send('Product added successfully.');
  } catch (error) {
      console.error('Error saving product to database:', error);
      message.channel.send('Error adding product. Please try again later.');
  }
}
async function addProductToInventory(userId, productName) {
  try {
    
    const insertQuery = `
      INSERT INTO user_inventory (user_id, product_name) 
      VALUES (?, ?)
    `;
    await executeQuery(insertQuery, [userId, productName]);
    console.log(`Product "${productName}" added to user's inventory.`);
    return true;
  } catch (error) {
    console.error('Error adding product to inventory:', error);
    return false;
  }
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const { customId } = interaction;

  if (customId === 'add_to_inventory') {
      const productName = interaction.message.embeds[0].title;
      const userId = interaction.user.id;
      try {
          await addProductToInventory(userId, productName);
          await interaction.reply({ content: 'Product added to your inventory!', ephemeral: true });
      } catch (error) {
          console.error('Error adding product to inventory:', error);
          await interaction.reply({ content: 'Failed to add product to your inventory. Please try again later.', ephemeral: true });
      }
  }
});


async function handleRemoveProductCommand(message) {
  const productName = message.content.slice('.removeproduct'.length).trim();
  if (!productName) {
    message.channel.send('استفاده: .removeproduct <نام محصول>');
    return;
  }
  try {
    await removeProduct(productName, message.guild);
    message.channel.send(`محصول "${productName}" با موفقیت حذف شد.`);
  } catch (error) {
    console.error('خطا در حذف محصول:', error);
    message.channel.send('خطا در حذف محصول. لطفاً بعداً دوباره امتحان کنید.');
  }
}

async function handleProductListCommand(message) {
  try {
    await sendProductList(message);
  } catch (error) {
    console.error('خطا در دریافت لیست محصولات:', error);
    message.channel.send('خطا در دریافت لیست محصولات. لطفاً بعداً دوباره امتحان کنید.');
  }
}

async function handleRestoreCommand(message) {
  try {
    await restoreProducts(message.guild);
    message.channel.send('محصولات بازیابی شدند.');
  } catch (error) {
    console.error('خطا در بازیابی محصولات:', error);
    message.channel.send('خطا در بازیابی محصولات. لطفاً بعداً دوباره امتحان کنید.');
  }
}

async function setupServer(guild, rules) {
  const category = await guild.channels.create('محصولات', { type: 'GUILD_CATEGORY' });
  console.log('دسته بندی محصولات ایجاد شد:', category.name);
  
  const sellerRole = await guild.roles.create({
    name: 'فروشنده',
    color: 'GREEN',
    permissions: ['MANAGE_CHANNELS', 'MANAGE_ROLES']
  });
  const customerRole = await guild.roles.create({
    name: 'مشتری',
    color: 'BLUE'
  });
  
  const ruleEmbed = new MessageEmbed()
    .setTitle('قوانین سرور')
    .setDescription(`**1.** در صورت ارسال پیام‌های سیاسی و فحاشی در چت، به مدت 24 ساعت بن خواهید شد، و در صورت تکرار، بن دائمی خواهید شد.\n
    **2.** ساعات کاری: 13:30 تا 24:00.\n
    **3.** در صورت ارسال رسید جعلی، به مدت 7 روزتایم اوت خواهید شد.\n
    **4.** در صورت خرید نیترو از شاپ ما، برخی آیتم‌ها تخفیف دارند.\n
    **5.** در صورت تبلیغ، به مدت 24 ساعت بن خواهید شد.\n
    **6.** گزارش‌های جعلی پیگیری خواهند شد و بن دائمی دارند.\n
    **7.** توهین به دیگران به مدت 24 ساعت تایم‌اوت خواهید شد.\n
    **8.** در صورت عدم رعایت قوانین و مقررات، تایم‌اوت خواهید شد.\n
    **9.** محصولات خریداری شده قابل بازگشت نیستند و هیچ مبلغی قابل استرداد نیست.\n
    **10.** زمان انتقال محصولات 5 دقیقه تا 1 ساعت است. در صورت مشکل، 1 ساعت تا 3 روز صبر کنید.\n
    **⚠️** لطفاً قوانین سرور را مطالعه کنید تا به مشکل برنخورید. **⚠️**`)
    .setColor('#0099ff');
  const rulesChannel = await guild.channels.create('قوانین', { type: 'GUILD_TEXT' });
  await rulesChannel.send({ embeds: [ruleEmbed] });
}
async function handleInventoryCommand(message) {
  function isAdmin(member) {
    return member.permissions.has('ADMINISTRATOR');
  }

  const targetUser = message.content.slice('.inventory'.length).trim();

  if (isAdmin && targetUser) {
    const targetMember = message.guild.members.cache.get(targetUser);
    if (!targetMember) {
      message.channel.send('کاربر یافت نشد.');
      return;
    }
    const userId = targetMember.id;
    try {
      const inventory = await getUserInventory(userId);
      let totalCost = 0;
      const items = [];
      for (const productName of inventory) {
        const product = await getProductByName(productName);
        if (product) {
          totalCost += product.price;
          items.push(`${product.name} - ${product.price} تومان`);
        }
      }

      const embed = new MessageEmbed()
        .setTitle(` سبد خرید ${targetMember.user.username}`)
        .setColor('#0099ff')
        .addField('محصولات', items.join('\n'))
        .addField('هزینه کل', `${totalCost} تومان`);

      message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error fetching user inventory:', error);
      message.channel.send('برای دیدن این لیست ابتدا باید یک محصول به سبد خرید خودتون اضافه کنید');
    }
  } else {
    const userId = message.author.id;
    try {
      const inventory = await getUserInventory(userId);
      let totalCost = 0;
      const items = [];
      for (const productName of inventory) {
        const product = await getProductByName(productName);
        if (product) {
          totalCost += product.price;
          items.push(`${product.name} - ${product.price} تومان`);
        }
      }

      const embed = new MessageEmbed()
        .setTitle(`سبد خرید ${message.author.username}`)
        .setColor('#0099ff')
        .addField('محصولات', items.join('\n'))
        .addField('هزینه کل', `${totalCost} تومان`);

      message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error fetching user inventory:', error);
      message.channel.send('خطا در دریافت موجودی کاربر. لطفاً بعداً دوباره امتحان کنید.');
    }
  }
}


async function getProductByName(productName) {
  const sql = 'SELECT * FROM products WHERE name = ?';
  const values = [productName];
  const result = await executeQuery(sql, values);
  return result[0];
}


async function createProductChannel(guild, productName) {
  const category = guild.channels.cache.find(channel => channel.type === 'GUILD_CATEGORY' && channel.name === 'محصولات');
  if (!category) {
    console.error('دسته بندی محصولات یافت نشد.');
    throw new Error('دسته بندی محصولات یافت نشد.');
  }

  const channel = await guild.channels.create(productName, { type: 'GUILD_TEXT', parent: category });
  console.log(`کانال محصول ایجاد شد: ${channel.name}`);
  return channel;
}

async function saveProductToDB(productName, price, description, imageLink) {
  const sql = 'INSERT INTO products (name, price, description, image_link) VALUES (?, ?, ?, ?)';
  const values = [productName, price, description, imageLink];

  await executeQuery(sql, values);
}

async function removeProduct(productName, guild) {
  const productChannel = guild.channels.cache.find(channel => channel.name === productName && channel.type === 'GUILD_TEXT');
  if (productChannel) {
    await productChannel.delete();
  }
  const sql = 'DELETE FROM products WHERE name = ?';
  await executeQuery(sql, [productName]);
}

async function sendProductList(message) {
  const products = await getProductsFromDB();
  const embed = new MessageEmbed()
    .setTitle('لیست محصولات')
    .setColor('#0099ff');

  products.forEach(product => {
    embed.addField(product.name, `قیمت: $${product.price.toFixed(2)}\nتوضیحات: ${product.description}`);
  });

  message.channel.send({ embeds: [embed] });
}

async function restoreProducts(guild) {
  const products = await getProductsFromDB();

  for (const product of products) {
    try {
      const { name, price, description, image_link } = product;
      const productChannel = await createProductChannel(guild, name);
      const embed = new MessageEmbed()
        .setTitle(name)
        .setDescription(description)
        .addField('قیمت', `${price.toFixed(2)}`)
        .addFields('❗️ قیمت ها به تومان است')
        .setImage(image_link)
        .setColor('#0099ff');
      
      await productChannel.send({ embeds: [embed] });
    } catch (error) {
      console.error('خطا در بازیابی محصول:', error);
    }
  }
}

async function getProductsFromDB() {
  const sql = 'SELECT * FROM products';
  return await executeQuery(sql);
}

async function connectToDatabase() {
  if (!connection || !connection.threadId) {
    connection = mysql.createConnection(mysqlConfig);

    await new Promise((resolve, reject) => {
      connection.connect(err => {
        if (err) {
          console.error('خطا در اتصال به MySQL:', err);
          reject(err);
        } else {
          console.log('به پایگاه داده MySQL متصل شد');
          resolve();
        }
      });
    });
  }
}
async function getUserInventory(userId) {
  const sql = 'SELECT * FROM user_inventory WHERE user_id = ?';
  const values = [userId];

  try {
      const result = await executeQuery(sql, values);
      if (result.length === 0) {
          return ['User inventory is empty.'];
      } else {
          const inventory = result.map(item => item.product_name);
          return inventory;
      }
  } catch (error) {
      throw new Error('Failed to fetch user inventory: ' + error.message);
  }
}

async function executeQuery(sql, values = []) {
  await connectToDatabase();

  return new Promise((resolve, reject) => {
    connection.query(sql, values, (err, result) => {
      if (err) {
        console.error('خطای پایگاه داده:', err);
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
}

client.login(token);
