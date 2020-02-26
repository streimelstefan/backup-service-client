const fs = require('fs');

console.log(__dirname + '/backups/');

console.log(new Date().toISOString().split(':').join('.').split('-').join('.'));
console.log(new Date().toISOString());

fs.readdir(__dirname + '/backups/', (err, files) => {
    //if (files.length >= this.deleteAfter) {
        files.forEach(file => {
            let time = file.split('-')[2].split('.');
            time.splice(-2, 2);
            time = time.join('-');
            time. = ':';
            time[16] = ':';
            console.log(time);
        });
    //}
});