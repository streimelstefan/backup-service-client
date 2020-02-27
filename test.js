const fs = require('fs');


console.log(new Date().toISOString().split(':').join('-').replace('.', '-'));

fs.readdir(__dirname + '/backups/', (err, files) => {
    //if (files.length >= this.deleteAfter) {
        files.forEach(file => {
            file = file.split('-');
            file.splice(0, 2);
            file[5] = file[5].split('.')[0];
            const date = new Date(file[0] + '-' + file[1] + '-' + file[2] + ':' + file[3] + ':' + file[4] + '.' + file[5]);
            console.log(date);
        });
    //}
});