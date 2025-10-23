[{
  id: '/#12poiajdspfoif',
  name: 'Andrew',
  room: 'The Office Fans'
}]

// addUser(id, name, room)
// removeUser(id)
// getUser(id)
// getUserList(room)

class Users {
  constructor() {
      this.users = [];
  }

  addUser(id, name, room, userId) { // ✅ Add userId
      const user = { id, name, room, userId };
      this.users.push(user);
      return user;
  }

  getUser(id) {
      return this.users.find((user) => user.id === id);
  }

  removeUser(id) {
      const user = this.getUser(id);
      if (user) {
          this.users = this.users.filter((user) => user.id !== id);
      }
      return user;
  }

  getUserList(room) {
      return this.users.filter((user) => user.room === room).map((user) => user.name);
  }
}

module.exports = {Users};

 // class Person {
 //   constructor (name, age) {
 //     this.name = name;
 //     this.age = age;
 //   }
 //   getUserDescription () {
 //     return `${this.name} is ${this.age} year(s) old.`;
 //   }
 // }
 //
 // var me = new Person('Andrew', 25);
 // var description = me.getUserDescription();
 // console.log(description);
