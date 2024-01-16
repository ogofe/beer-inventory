const nodemailer = require("nodemailer");
const fs = require("fs");
const pdf = require('pdfjs');
const cheerio = require('cheerio');
const winston = require('winston');
const { stdout } = require("process");
const { EventEmitter } = require('events');
const BreweryModel = require('./models/breweryModel');
const SupplierModel = require('./models/supplierModel');
const KegSizeModel = require('./models/kegsizeModel');

const orderPlacedSignal = new EventEmitter();

// Your order processing logic
async function orderPlacedHandler ({orderedItems, user }) {
  
  const breweries = []
  const suppliers = []
  const kegsizes = []

  function mapBreweries(err, data){
    if(err){
    }else{
      data.forEach(val => {
        breweries.push({
          id: val.brewery_id,
          name: val.name
        })
      })
    }
  }

  function mapSuppliers(err, data){
    if(err){
    }else{
      data.forEach(val => {
        suppliers.push({
          id: val.supplier_id,
          name: val.name
        })
      })
    }
  }

  function mapKegSizes(err, data){
    if(err){
    }else{
      data.forEach(val => {
        kegsizes.push({
          id: val.keg_size_id,
          name: val.name
        })
      })
    }
  }

  await BreweryModel.getAllBreweries(mapBreweries)
  await SupplierModel.getAllSuppliers(mapSuppliers)
  await KegSizeModel.getAllSizes(mapKegSizes)

  setTimeout(() => {
    const file = makePDF({
      user,
      breweries,
      suppliers,
      orderedItems,
      kegsizes,
    })

    let fname;

    if (file.includes('/')){
      fname = file.split('/').pop() 
    }else{
      fname = file.split('\\').pop() 
    }

    
    // ... create the pdf and send the email  ...
    sendMail({
      user,
      attachments: [
        {
          filename: fname,
          path: file
        },
      ]
    })
  }, 2000)
  
};


const mailTransporter = nodemailer.createTransport({
  host: process.env.EMAIL_SMTP_HOST || "smtp.binsoft.online",
  port: process.env.EMAIL_SMTP_PORT || 465,
  secure: true,
  auth: {
    // TODO: replace `user` and `pass` values from cpanel
    user: 'no-reply@beer.binsoft.online',
    pass: 'SomethingSecret',
    // user: process.env.EMAIL_SMTP_USER,
    // pass: process.env.EMAIL_SMTP_PASSWORD,
  },
});


// Create a logger with a file transport

// const logger = winston.createLogger({
//   transports: [
//     new winston.transports.File({ filename: `${process.cwd()}/server-logs.log` })
//   ]
// });


// async..await is not allowed in global scope, must use a wrapper
async function sendMail({user, attachments}) {
  
  const domainName = "https://beer.binsoft.online"
  const message = `
    Please print and replace your Ordered Beers List.

    Here's a link to a printable version of the beer order list: ${domainName}/file/${attachments[0].filename}
  `
  try{
    // send mail with defined transport object
    console.log("Sending Mail...")
    const mail = await mailTransporter.sendMail({
      from: `"University Of Beer" <no-reply@beer.binsoft.online>`,
      to: '7thogofe@gmail.com, jtogofe@outlook.com, tyabolaji@gmail.com', // list of receivers
      subject: `${user} Just Placed A New Beer Order!`,
      text: message,
      attachments // Array.of {filename: 'filename.txt/jpg/pdf/csv', content: "file data"}
    });
    console.log("Message sent: %s", mail.messageId)
  }catch(err){
    console.error()
  }
}

// Function to log messages in a structured format
// function logError(error, origin) {
//   const timestamp = new Date().toISOString();
//   const logMessage = `
//     ---------------- Error -------------------------
//     Timestamp: [${timestamp}]
//     Error: ${error.stack || error.message || error}
//     Origin: ${origin || "Origin not specified"}
//     ------------------------------------------------
//     \n\n
//   `;
//   logger.error(logMessage);
// }


async function readFile(fname){
  fs.readFile(fname, 'utf-8', (err, data) => {
    if (err){
      throw err
    }

    return data 
  })
}


function makePDF(data){
  let now;
  now = Date.now().toString().split(' T')
  now = now[0]
  const fname = `${process.cwd()}/files/beer-order-${now}.pdf`;
  
  const doc = new pdf.Document({
    font:    require('pdfjs/font/Helvetica'),
    padding: 20,
    fontSize: 8
  })
  
  doc.pipe(fs.createWriteStream(fname))
  doc.text("Here are the latest order\n", {
    alignment: 'center',
    fontSize: 20,
    paddingBottom: 10,
    textAlign: 'center'
  });

  // pdf Header
  doc.table({
    width: 500,
    padding: 10,
    backgroundColor: '#000',
    color: '#fff',
    widths: ['*'],
    lineHeight: 2,
  })
  .header({
    paddingBottom: 10,
    paddingTop: 10
  })
  .cell(
    "If a keg doesn't come in or if something arrives that is not on this list, call Bob Janis immediately (916)759-7739"
  )

  // create the table 
  const table = doc.table({
    widths: [30, 70, 70, 70, 70, 70, 70,],
    borderWidth: 1,
    width: 700,    
    padding: 5,
  });
  
  // The table header
  const th = table.header()
  th.cell('S/N')
  th.cell('Expected Delivery Date')
  th.cell('Supplier')
  th.cell('Beer Name')
  th.cell('Price Per Keg')
  th.cell('Brewery')
  th.cell('Keg Size')

  // INFO: write the rows of ordered items
  if (data){
    for(let idx = 0; idx < data.orderedItems.length; idx++){
      const row = table.row();
      const item = data.orderedItems[idx]
      const supplier = data.suppliers.find(elem => elem.id === item.supplier_id)
      const brewery = data.breweries.find(elem => elem.id === item.brewery_id)
      const keg = data.kegsizes.find(elem => elem.id === item.keg_size_id)

      row.cell(`${idx+1}`)
      row.cell(item.arrival_date)
      row.cell(item.name)
      row.cell(item.price_per_keg )

      // FIX: Shows up as NA because arrays are empty      
      row.cell(supplier?.name || "Not Available")
      row.cell(brewery?.name || "Not Available")
      row.cell(keg?.name || "Not Available")
    }
  }else{

  }
  doc.end(); // stop editing
  return fname
}


function htmlToText(htmlMessage) {
  // Load the HTML into cheerio
  const $ = cheerio.load(htmlMessage, isDocument=false);

  // Extract the text content
  const textContent = $('body').text();
  return textContent;
}


orderPlacedSignal.on('orderPlaced', orderPlacedHandler)


module.exports = {
  sendMail,
  mailTransporter,
  readFile,
  makePDF,
  orderPlacedSignal,
//  logError,
  htmlToText,
}

