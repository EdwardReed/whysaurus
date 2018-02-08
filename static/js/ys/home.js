import 'babel-polyfill';
import React from 'react';
import ReactDOM from 'react-dom';
const { Map, List, Seq } = require('immutable');
const prettyI = require("pretty-immutable");
import gql from 'graphql-tag';
import { graphql } from 'react-apollo';
import * as schema from './schema';

class Home extends React.Component {
  render(){
    let homePage = this.props.data.homePage;
    let featuredPoint = homePage && homePage.featuredPoint;
    return <div><h1>Home Page</h1>
      <h3>Featured Point:</h3>
      <h4>{featuredPoint && featuredPoint.title}</h4>
      </div>
  }
}

export const HomePage = graphql(schema.HomePage)(Home);